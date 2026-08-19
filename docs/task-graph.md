---
title: Task graph and verified execution
version: 0.3
category: explanation
---

# Task graph and verified execution

## Plan templates

`PlanEngine` currently uses deterministic goal classification. Goals matching `fix`, `test`, `bug`, `code`, or `parser` receive the coding plan:

```text
Inspect repository
  -> Run tests
  -> Diagnose failures
  -> Fix implementation
  -> Run targeted tests
  -> Run full suite
  -> Review diff
```

Other goals receive `Inspect goal -> Execute goal -> Verify result`. V0.3 does not ask the model to generate arbitrary graph topology.

## Scheduling

A pending task becomes `ready` only when every dependency is `completed`. A failed or blocked dependency makes downstream pending tasks `blocked`. The runtime executes ready tasks and persists every transition.

Task statuses are `pending`, `ready`, `running`, `waiting`, `blocked`, `completed`, `failed`, and `needs_approval`.

## Phases

- `plan`: create and persist the graph.
- `execute`: inspect, test, diagnose, and modify.
- `verify`: run reviewer checks and gate completion.

The current CLI reviewer runs the Vitest suite for test verification. The “targeted tests” task currently uses the same full Vitest command; test-impact selection is not implemented. Diff review runs `git diff --check && git diff --stat`.

## Rejection and repair

When verification fails, the reviewer marks the verification task failed, reopens its direct dependency if retry budget remains, and returns the verification task to pending. Once retries are exhausted, the plan fails.

## Failure policies

| Policy | Runtime behavior |
| --- | --- |
| `retryable` | Return the task to ready while retry budget remains. |
| `non_retryable` | Fail the task and plan. |
| `blocked` | Block the task and fail progress. |
| `needs_approval` | Persist approval, move task to `needs_approval`, and plan/agent to `waiting`. |
| `needs_human` | Mark task blocked and stop automated progress. |

## Completion invariant

The runtime marks a plan `completed` only when every task is `completed`. A successful CLI process does not imply a successful plan; inspect the plan status.
