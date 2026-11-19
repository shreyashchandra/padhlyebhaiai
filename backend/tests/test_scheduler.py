from datetime import date, timedelta

from app.services import srs
from app.services.scheduler import SubjectIn, TopicIn, build_schedule

ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _topics(subject_id, n, minutes=60, priority="should", start_id=1):
    return [TopicIn(id=start_id + i, subject_id=subject_id, name=f"T{start_id + i}", est_minutes=minutes, priority=priority, position=i) for i in range(n)]


def test_respects_daily_capacity_and_study_days():
    start = date(2026, 1, 5)  # Monday
    result = build_schedule(start, start + timedelta(days=13), ["Monday", "Wednesday"], 90, 60, [SubjectIn(1, "Maths", None)], _topics(1, 6))
    per_day = {}
    for t in result.tasks:
        assert t.date.weekday() in (0, 2)
        per_day[t.date] = per_day.get(t.date, 0) + t.minutes
    assert all(m <= 90 for m in per_day.values())
    assert not result.unscheduled


def test_reserves_revision_and_mock_before_exam_and_nothing_after():
    start = date(2026, 1, 1)
    exam = start + timedelta(days=10)
    result = build_schedule(start, start + timedelta(days=20), ALL_DAYS, 120, 60, [SubjectIn(1, "Physics", exam)], _topics(1, 5))
    assert all(t.date < exam for t in result.tasks)
    last_day = exam - timedelta(days=1)
    kinds = {t.kind for t in result.tasks if t.date == last_day}
    assert {"revise", "mock"} <= kinds


def test_urgent_subject_scheduled_first_and_overflow_reported():
    start = date(2026, 1, 1)
    subjects = [SubjectIn(1, "Soon", start + timedelta(days=3)), SubjectIn(2, "Later", start + timedelta(days=30))]
    topics = _topics(1, 10, minutes=60) + _topics(2, 3, start_id=100)
    result = build_schedule(start, start + timedelta(days=30), ALL_DAYS, 120, 60, subjects, topics)
    first_day = [t for t in result.tasks if t.date == start]
    assert all(t.subject_id == 1 for t in first_day)
    assert any(u["subject"] == "Soon" for u in result.unscheduled)


def test_crash_mode_drops_low_priority_and_skips_done():
    start = date(2026, 1, 1)
    topics = _topics(1, 2, priority="low") + _topics(1, 2, priority="must", start_id=10)
    topics[2].status = "done"
    result = build_schedule(start, start + timedelta(days=5), ALL_DAYS, 120, 60, [SubjectIn(1, "Chem", None)], topics, mode="crash-prep")
    scheduled_ids = {t.topic_id for t in result.tasks}
    assert 1 not in scheduled_ids and 2 not in scheduled_ids and 10 not in scheduled_ids
    assert 11 in scheduled_ids
    assert {u["topic_id"] for u in result.unscheduled} == {1, 2}


def test_long_topic_split_into_parts():
    start = date(2026, 1, 1)
    result = build_schedule(start, start + timedelta(days=5), ALL_DAYS, 60, 45, [SubjectIn(1, "Bio", None)], _topics(1, 1, minutes=120))
    titles = [t.title for t in result.tasks if t.kind == "learn"]
    assert len(titles) >= 2 and "part 1" in titles[0]
    assert sum(t.minutes for t in result.tasks if t.kind == "learn") == 120


def test_srs_intervals_grow_and_lapse_resets():
    today = date(2026, 1, 1)
    ease, interval, reps, lapses, due = srs.review(2.5, 0, 0, 0, "good", today)
    assert interval == 1 and due == today + timedelta(days=1)
    ease, interval, reps, lapses, due = srs.review(ease, interval, reps, lapses, "good", today)
    assert interval == 3
    ease, interval, reps, lapses, due = srs.review(ease, interval, reps, lapses, "good", today)
    assert interval > 3
    ease2, interval, reps, lapses, due = srs.review(ease, interval, reps, lapses, "again", today)
    assert interval == 0 and reps == 0 and lapses == 1 and ease2 < ease
