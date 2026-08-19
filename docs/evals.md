---
title: Evaluation harness
version: 0.4
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
| `v0.4 parent to coder` | Child modifies a file, result and artifact reach the root. |
| `v0.4 researcher to coder handoff` | Coder receives visible summarized research, not full child history. |
| `v0.4 coder reviewer repair` | Reviewer rejects, coder repairs, reviewer accepts. |
| `v0.4 bounded parallel tasks` | Two independent tasks overlap without exceeding the bound. |
| `v0.4 child crash resume` | Existing child resumes once without duplicate execution. |
| `v0.4 parent crash before consume` | Persisted result is delivered and acknowledged exactly once. |
| `v0.4 cancellation hierarchy` | Root cancellation cancels descendants and leases. |
| `v0.4 child approval resume` | Approval resumes the correct child without spawning another. |

The 14-scenario harness is deterministic and in-memory. Executors and reviewers are test doubles; it measures orchestration invariants, not model intelligence or real repository repair quality.

The same harness runs in the Vitest suite. A scenario command exits non-zero if any scenario fails.
