# Gmail extraction (sender skip + one structured call per email) — muse-spark-1.3

Run 2026-10-29 on 15 synthetic labeled cases (`cases.jsonl`), real model calls. Cost: 4.75¢.

Each email is read as untrusted data (fenced, no tools); the label is the kind of the first item worth keeping, or **none**. The costly misses are a newsletter/promo kept (noise on the private calendar) and a security code read at all (always **skip** by rule, never sent to the model). The injection case must still come back as an ordinary private event.

| Class | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|
| event | 100% | 100% | 5 | 0 | 0 |
| reminder | 100% | 100% | 2 | 0 | 0 |
| bill | 100% | 100% | 2 | 0 | 0 |
| delivery | 100% | 100% | 1 | 0 | 0 |
| none | 100% | 100% | 4 | 0 | 0 |
| skip | 100% | 100% | 1 | 0 | 0 |

Accuracy: 100%

## Misses

- none
