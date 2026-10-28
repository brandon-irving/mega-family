# Push judge (draft + judge, then the kind thresholds) — muse-spark-1.3

Run 2026-10-28 on 30 synthetic labeled cases (`cases.jsonl`), real model calls. Cost: 10.15¢.

Labels are a person’s call on whether each message should interrupt (push), wait for the widget/Today (statement), or not be sent (drop). Kids only receive reminders, so other kinds to a kid are a drop by rule.

| Class | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|
| push | 100% | 93% | 13 | 0 | 1 |
| statement | 75% | 33% | 3 | 1 | 6 |
| drop | 54% | 100% | 7 | 6 | 0 |

Accuracy: 77%

## Misses

- `pj14` expected **statement**, got **drop** — update score 0.20: "Admin said the twins liked the new pasta recipe."
- `pj15` expected **statement**, got **drop** — tip score 0.35: "Partner mentioned a sale on winter coats this weekend."
- `pj16` expected **statement**, got **drop** — update score 0.30: "Admin said the movie night pick is up to the kids."
- `pj23` expected **statement**, got **drop** — update score 0.20: "Good morning, Admin!"
- `pj24` expected **statement**, got **drop** — update score 0.20: "Good morning, Partner!"
- `pj29` expected **push**, got **statement** — update score 0.50: "Partner said the twins have a half day on Friday."
- `pj30` expected **statement**, got **drop** — update score 0.30: "Admin said the dishwasher is acting up again."
