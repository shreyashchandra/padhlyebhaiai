"""Deterministic study scheduler.

The AI decides *what matters* (topic priority, time estimates). This module
decides *when* - it packs topics into real calendar days, respecting each
subject's exam date, the student's daily capacity and study days. Keeping
date maths out of the LLM makes plans reliable and lets us rebalance a plan
instantly (and for free) when the student falls behind.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
PRIORITY_RANK = {"must": 0, "should": 1, "low": 2}
MODE_FACTOR = {"full-prep": 1.0, "last-month": 0.8, "crash-prep": 0.6}
MIN_CHUNK = 20


@dataclass
class SubjectIn:
    id: int
    name: str
    exam_date: date | None


@dataclass
class TopicIn:
    id: int
    subject_id: int
    name: str
    priority: str = "should"
    est_minutes: int = 60
    status: str = "not_started"
    confidence: int = 0
    position: int = 0
    done_minutes: int = 0  # minutes already completed in this plan


@dataclass
class TaskOut:
    date: date
    subject_id: int | None
    topic_id: int | None
    title: str
    kind: str
    minutes: int


@dataclass
class ScheduleResult:
    tasks: list[TaskOut] = field(default_factory=list)
    unscheduled: list[dict] = field(default_factory=list)


def _round5(value: float) -> int:
    return max(5, int(round(value / 5.0)) * 5)


def study_dates(start: date, end: date, study_days: list[str]) -> list[date]:
    allowed = {WEEKDAYS.index(d) for d in study_days if d in WEEKDAYS}
    days, current = [], start
    while current <= end:
        if current.weekday() in allowed:
            days.append(current)
        current += timedelta(days=1)
    return days


def _work_items(topics: list[TopicIn], mode: str) -> tuple[list[dict], list[dict]]:
    factor = MODE_FACTOR.get(mode, 1.0)
    items, dropped = [], []
    for t in sorted(topics, key=lambda t: (PRIORITY_RANK.get(t.priority, 1), t.position)):
        if t.status in ("done", "revised"):
            if t.confidence and t.confidence <= 2:
                items.append({"topic": t, "kind": "revise", "remaining": 30})
            continue
        if mode == "crash-prep" and t.priority == "low":
            dropped.append({"topic_id": t.id, "name": t.name, "reason": "Low priority in crash mode"})
            continue
        minutes = t.est_minutes * factor * (0.5 if t.status == "learning" else 1.0)
        remaining = _round5(max(MIN_CHUNK, minutes) - t.done_minutes)
        if remaining >= MIN_CHUNK:
            items.append({"topic": t, "kind": "learn", "remaining": remaining, "part": 1})
    return items, dropped


def build_schedule(
    start: date,
    end: date,
    study_days: list[str],
    daily_minutes: int,
    session_minutes: int,
    subjects: list[SubjectIn],
    topics: list[TopicIn],
    mode: str = "full-prep",
) -> ScheduleResult:
    result = ScheduleResult()
    days = study_dates(start, end, study_days)
    if not days or daily_minutes < MIN_CHUNK:
        return result

    session_minutes = max(MIN_CHUNK, session_minutes)
    capacity = {d: daily_minutes for d in days}
    subject_by_id = {s.id: s for s in subjects}

    # Each subject's deadline = last study day strictly before its exam (or plan end).
    deadline: dict[int, date] = {}
    for s in subjects:
        before_exam = [d for d in days if s.exam_date is None or d < s.exam_date]
        if before_exam:
            deadline[s.id] = before_exam[-1]

    # Reserve the final pre-exam day for full revision + a timed mock paper.
    for s in subjects:
        if s.exam_date is None or s.id not in deadline or s.exam_date > end + timedelta(days=1):
            continue
        last_day = deadline[s.id]
        if len([d for d in days if d <= last_day]) < 3:
            continue
        half = _round5(daily_minutes / 2)
        result.tasks.append(TaskOut(last_day, s.id, None, f"Full revision: {s.name}", "revise", half))
        result.tasks.append(TaskOut(last_day, s.id, None, f"Timed mock paper: {s.name}", "mock", half))
        capacity[last_day] -= half * 2
        deadline[s.id] = max((d for d in days if d < last_day), default=last_day)

    queues: dict[int, list[dict]] = {s.id: [] for s in subjects}
    for t in topics:
        if t.subject_id in queues:
            queues[t.subject_id].append(t)
    work: dict[int, list[dict]] = {}
    for sid, ts in queues.items():
        items, dropped = _work_items(ts, mode)
        work[sid] = items
        for d in dropped:
            result.unscheduled.append({**d, "subject": subject_by_id[sid].name})

    spaced: dict[date, list[TopicIn]] = {}

    for index, day in enumerate(days):
        cap = capacity[day]

        # 1. Spaced quick revisions of must-do topics learned a couple of days ago.
        for topic in spaced.pop(day, []):
            if cap < 15:
                break
            result.tasks.append(TaskOut(day, topic.subject_id, topic.id, f"Quick recall: {topic.name}", "revise", 15))
            cap -= 15

        # 2. Fill the rest by subject pressure (remaining work / days left).
        while cap >= MIN_CHUNK:
            candidates = []
            for sid, items in work.items():
                if not items or sid not in deadline or day > deadline[sid]:
                    continue
                days_left = sum(1 for d in days[index:] if d <= deadline[sid])
                pressure = sum(i["remaining"] for i in items) / max(1, days_left)
                candidates.append((pressure, sid))
            if not candidates:
                break
            candidates.sort(reverse=True)
            sid = candidates[0][1]
            item = work[sid][0]
            topic: TopicIn = item["topic"]

            chunk = min(item["remaining"], session_minutes, cap)
            if chunk < MIN_CHUNK:
                break
            if item["kind"] == "revise":
                title = f"Revise weak topic: {topic.name}"
            else:
                multi = item["remaining"] > chunk or item["part"] > 1
                title = f"Learn: {topic.name}" + (f" (part {item['part']})" if multi else "")
            result.tasks.append(TaskOut(day, sid, topic.id, title, item["kind"], chunk))
            cap -= chunk
            item["remaining"] -= chunk
            item["part"] = item.get("part", 1) + 1

            if item["remaining"] < MIN_CHUNK:
                work[sid].pop(0)
                if item["kind"] == "learn" and topic.priority == "must" and mode != "crash-prep":
                    future = [d for d in days[index + 2 : index + 4] if d <= deadline[sid]]
                    if future:
                        spaced.setdefault(future[-1], []).append(topic)

    for sid, items in work.items():
        for item in items:
            result.unscheduled.append(
                {
                    "topic_id": item["topic"].id,
                    "name": item["topic"].name,
                    "subject": subject_by_id[sid].name,
                    "reason": "Not enough study time before the exam",
                }
            )

    result.tasks.sort(key=lambda t: (t.date, {"revise": 0, "learn": 1, "practice": 2, "mock": 3}.get(t.kind, 1)))
    return result
