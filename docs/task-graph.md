# Task graph and verified execution

`PlanEngine` turns a goal into tasks with explicit dependency ids. Every task persists status, retry count, maximum retries, failure policy, result, and blocked reason. `TaskGraphRuntime` only schedules tasks whose dependencies completed.

`VerifiedExecutionRuntime` exposes `plan`, `execute`, and `verify` phases. Execution can register created or modified artifacts. Verification runs through a separate `Reviewer`; rejection reopens the related dependency while retry budget remains. A plan completes only when every task completes.

Failure policies are `retryable`, `non_retryable`, `blocked`, `needs_approval`, and `needs_human`. The fixed eval harness covers failing-test repair, file creation, multi-file modification, crash/resume, denied tools, and failed verification.
