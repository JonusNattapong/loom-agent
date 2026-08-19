# State and recovery

Each V0.3 run stores an agent, plan, task graph, task checkpoints, approval requests, artifacts, trace events, and tool execution ledger records. Checkpoints use `cp_...` ids and include plan, task, phase, step, and a state snapshot. Artifacts link to both task and checkpoint.

A tool call is recorded as `executing` before invocation and `succeeded` or `failed` afterward. A successful call is reused; an uncertain execution is not replayed automatically. Approval-required tasks remain paused until their durable request is approved or denied.

This is crash-aware bookkeeping, not a process sandbox. Shell execution still has the permissions of the Loom process.
