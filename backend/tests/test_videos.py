import httpx
import pytest

from app.config import settings
from app.services import youtube


def _item(vid, views, likes, duration="PT45M"):
    return {
        "id": vid,
        "snippet": {"title": f"Video {vid}", "channelTitle": "Ch", "thumbnails": {"high": {"url": f"https://i.ytimg.com/{vid}.jpg"}}, "liveBroadcastContent": "none"},
        "statistics": {"viewCount": str(views), "likeCount": str(likes)},
        "contentDetails": {"duration": duration},
    }


def test_rank_prefers_popular_and_drops_shorts_and_streams():
    items = [
        _item("short", 9_000_000, 90_000, "PT50S"),
        _item("small", 2_000, 50),
        _item("famous", 3_500_000, 80_000, "PT1H12M"),
        _item("marathon", 8_000_000, 70_000, "PT6H"),
    ]
    ranked = youtube.rank_videos(items, ["small", "short", "famous", "marathon"])
    assert [v["id"] for v in ranked] == ["famous", "small"]
    assert ranked[0]["duration_seconds"] == 72 * 60 and ranked[0]["url"].endswith("famous")


def test_query_building():
    assert youtube.build_query("Kinematics (part 2)", "Physics", "JEE Main", "en") == "Kinematics Physics JEE Main full lecture"
    assert youtube.build_query("Gauss's law", "Physics", None, "hi").endswith("in Hindi")


@pytest.fixture
def subject_with_topic(auth_client):
    s = auth_client.post("/api/catalog/jee-main/add", json={"subject_keys": ["physics"]}).json()["created"][0]
    return auth_client.get(f"/api/subjects/{s['id']}").json()


def test_fallback_without_key(auth_client, subject_with_topic, monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "")
    topic = subject_with_topic["topics"][0]
    data = auth_client.get(f"/api/videos/topic/{topic['id']}").json()
    assert data["source"] == "search_link" and data["videos"] == [] and data["reason"] == "not_configured"
    assert data["search_url"].startswith("https://www.youtube.com/results?search_query=Units")


def test_fetch_ranks_and_caches(auth_client, subject_with_topic, monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "k")
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url.path)
        if request.url.path.endswith("/search"):
            assert request.url.params["videoEmbeddable"] == "true"
            return httpx.Response(200, json={"items": [{"id": {"videoId": v}} for v in ("a", "b")]})
        return httpx.Response(200, json={"items": [_item("a", 1000, 10), _item("b", 2_000_000, 40_000)]})

    real_client = httpx.Client
    monkeypatch.setattr(youtube.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))

    topic = subject_with_topic["topics"][1]
    first = auth_client.get(f"/api/videos/topic/{topic['id']}", params={"lang": "hi"}).json()
    assert first["source"] == "youtube" and [v["id"] for v in first["videos"]] == ["b", "a"]
    assert "in Hindi" in first["query"]
    second = auth_client.get(f"/api/videos/topic/{topic['id']}", params={"lang": "hi"}).json()
    assert second.get("cached") and len(calls) == 2  # second request served from cache

    # Upstream errors degrade to a search link instead of failing.
    monkeypatch.setattr(youtube.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(lambda r: httpx.Response(403)), **kw))
    other = subject_with_topic["topics"][2]
    assert auth_client.get(f"/api/videos/topic/{other['id']}").json()["source"] == "search_link"


def test_task_videos_and_ownership(client, auth_client, subject_with_topic, monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "")
    task = auth_client.post("/api/tasks", json={"title": "Solve 2019 paper", "date": "2026-12-01", "subject_id": subject_with_topic["id"]}).json()
    data = auth_client.get(f"/api/videos/task/{task['id']}").json()
    assert "Solve 2019 paper Physics JEE Main" in data["query"]
    other = client.post("/api/auth/register", json={"email": "vid-intruder@example.com", "password": "password123"}).json()
    r = client.get(f"/api/videos/task/{task['id']}", headers={"Authorization": f"Bearer {other['access_token']}"})
    assert r.status_code == 404
    assert auth_client.get(f"/api/videos/task/{task['id']}", params={"lang": "fr"}).status_code == 422
