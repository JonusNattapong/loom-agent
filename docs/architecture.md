# Loom V0.3 architecture

Loom remains a single-agent, CLI-first durable harness. V0.3 separates planning, task execution, and verification. The task graph decides what is runnable; executors perform work; reviewers gate completion. SQLite persists every transition.

Packages are deliberately separated: `core` contracts, `planner` task graph and verified execution, `evals` fixed scenarios, `context` compilation, `skills` discovery/loading, `providers` response normalization, `mcp` stdio adapter, `tools` middleware, `state` migrations and durable records, `runtime` V0.2-compatible orchestration, and `cli` presentation.

SQLite remains the source of durable truth. The CLI is the primary interface.
