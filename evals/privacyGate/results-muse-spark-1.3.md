# Privacy gate (concern classifier + keyword backstop) — muse-spark-1.3

Run 2026-10-28 on 30 synthetic labeled cases (`cases.jsonl`), real model calls. Cost: 6.04¢.

Positive class is **sensitive** (any non-"ok" category: never saved / saved as sensitive). A miss on "sensitive" is the costly one: something private could be treated as ordinary.

| Class | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|
| sensitive | 100% | 100% | 15 | 0 | 0 |
| ok | 100% | 100% | 15 | 0 | 0 |

Accuracy: 100%

## Misses

- none
