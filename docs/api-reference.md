---
title: Package API reference
version: 0.3
category: reference
---

# Package API reference

## `@loom/planner`

- `PlanEngine.create(agentId, goal)`: persist a deterministic plan and tasks.
- `TaskGraphRuntime.runnable(planId)`: transition eligible pending tasks to ready and return ready tasks.
- `VerifiedExecutionRuntime.run(planId, options)`: execute and verify until completion, pause, wait, or failure.
- `VerifiedExecutionRuntime.resume(agentId, options)`: recover the newest plan and reconcile approvals.
- `TaskExecutor`: boundary for non-verification task execution.
- `Reviewer`: boundary for verification decisions.

## `@loom/state`

`StateStore` owns migrations and CRUD for agents, plans, tasks, memory, approvals, artifacts, checkpoints, traces, and tool ledger records. Constructor accepts a SQLite path or uses `LOOM_DB`.

## `@loom/tools`

- `ToolRegistry`: register, retrieve, list, and describe normalized tools.
- `ToolExecutor`: apply permissions, approvals, idempotency checks, execution, result limiting, artifacts, and traces.
- `createNativeTools(root, hooks)`: create `read_file`, `write_file`, and `shell` tools scoped to a workspace.
- `ApprovalRequiredError`: error carrying `failurePolicy = needs_approval` and request id.

## `@loom/providers`

- `MockProvider`: deterministic provider for local tests.
- `OpenAICompatibleProvider`: non-streaming Chat Completions adapter.

## `@loom/context`

`ContextCompiler.compile(input)` prioritizes system, goal, runtime, skills, memory, tools, recovery, messages, and files under a character budget. Goal and available tools are required sources.

## `@loom/skills`

`SkillRuntime.discover`, `get`, and `load` parse project `SKILL.md` files.

## `@loom/mcp`

`McpClient.connect`, `definitions`, `call`, and `close` implement the current stdio adapter. `mcpTools(client)` converts definitions into Loom tools.

## Stability

Package APIs are pre-1.0 and may change. SQLite migrations are designed to be forward-applied; TypeScript API compatibility is not yet guaranteed across milestones.
