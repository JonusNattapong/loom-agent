# Loom V0.2 architecture

Loom remains a single-agent, CLI-first durable harness. The CLI selects configuration, provider, skills, and tools; `AgentLoop` compiles context, calls a provider, executes normalized tools, and persists checkpoints/traces through SQLite.

Packages are deliberately separated: `core` contracts, `context` compilation, `skills` discovery/loading, `providers` response normalization, `mcp` stdio adapter, `tools` middleware and native tools, `state` migrations/memory/ledger, `runtime` orchestration, and `cli` presentation.

SQLite is the source of durable truth. V0.2 migrations add `working_memory` and `tool_execution_ledger` without deleting V0.1 tables.
