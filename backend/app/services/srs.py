"""SM-2 spaced repetition scheduling for flashcards."""

from datetime import date, timedelta

# UI grades -> SM-2 quality scores
GRADES = {"again": 1, "hard": 3, "good": 4, "easy": 5}


def review(ease: float, interval: int, reps: int, lapses: int, grade: str, today: date | None = None):
    """Return (ease, interval_days, reps, lapses, due) after a review."""
    today = today or date.today()
    quality = GRADES.get(grade)
    if quality is None:
        raise ValueError(f"Unknown grade {grade!r}")

    if quality < 3:
        reps = 0
        lapses += 1
        interval = 0  # see it again today
    else:
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 3 if quality < 5 else 4
        else:
            interval = max(1, round(interval * ease * (0.85 if quality == 3 else 1.3 if quality == 5 else 1)))

    ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    return round(ease, 3), interval, reps, lapses, today + timedelta(days=interval)
