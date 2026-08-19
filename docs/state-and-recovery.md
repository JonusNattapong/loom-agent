# State and recovery

Each run stores an agent row, a checkpoint containing messages and phase metadata, trace events, and tool execution ledger records. A tool call with an id is recorded as `executing` before invocation and `succeeded` or `failed` after it. A previously successful call is reused; an uncertain execution is not replayed automatically.

This is crash-aware bookkeeping, not a process sandbox. Shell execution still has the permissions of the Loom process and should be used only in a trusted workspace.
