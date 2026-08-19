---
title: Evaluation harness
version: 0.3
category: reference
---

# Evaluation harness

Run the fixed scenarios with:

```bash
npm run eval
```

| Scenario | Success condition |
| --- | --- |
| `fix failing tests` | Reviewer rejects once, repair path reruns, plan completes. |
| `create file` | Completed plan records one artifact. |
| `modify multiple files` | Completed plan records three artifacts. |
| `crash + resume` | Plan pauses after two tasks and completes after resume. |
| `failed verification` | Repeated rejection exhausts recovery and fails the plan. |
| `denied tool call` | A denied tool never executes. |

The harness is deterministic and in-memory. Executors and reviewers are test doubles; it measures orchestration invariants, not model intelligence or real repository repair quality. Keep scenario names and expected outcomes stable so later versions can be compared.

The same harness runs in the Vitest suite. A scenario command exits non-zero if any scenario fails.
