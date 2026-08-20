---
title: Package API reference
version: 0.4
category: reference
---

# Package API reference

## `@loom-agent/coordinator`

- `AgentCoordinator.spawnAgent`, `delegate`, and `cancelAgent`: manage durable parent-child lifecycle.
- `AgentMessageBus.send`, `receive`, `acknowledge`, and `list`: operate the local durable A2A bus.
- `AgentContextCompiler.compile`: build role- and task-scoped context.
- `MultiAgentRuntime.run` and `resume`: coordinate bounded task delegation, result handoff, repair, and recovery.
- `RoleRegistry.get`, `list`, and `load`: expose built-in roles and optional `.loom/agents/<role>.md` overrides.

## `@loom-agent/planner`

- `PlanEngine.create(agentId, goal)`: persist a deterministic plan and tasks.
- `TaskGraphRuntime.runnable(planId)`: transition eligible pending tasks to ready and return ready tasks.
- `VerifiedExecutionRuntime.run(planId, options)`: execute and verify until completion, pause, wait, or failure.
- `VerifiedExecutionRuntime.resume(agentId, options)`: recover the newest plan and reconcile approvals.
- `TaskExecutor`: boundary for non-verification task execution.
- `Reviewer`: boundary for verification decisions.

## `@loom-agent/state`

`StateStore` owns migrations and CRUD for agents, plans, tasks, scoped memory, approvals, artifacts, checkpoints, traces, tool ledger records, delegations, messages, results, and leases. Atomic helpers cover child/delegation creation, lease acquisition, and result/message persistence. Call `close()` before deleting or replacing a database file.

## `@loom-agent/tools`

- `ToolRegistry`: register, retrieve, list, and describe normalized tools.
- `ToolExecutor`: apply permissions, approvals, idempotency checks, execution, result limiting, artifacts, and traces.
- `createNativeTools(root, hooks)`: create `read_file`, `write_file`, and `shell` tools scoped to a workspace.
- `ApprovalRequiredError`: error carrying `failurePolicy = needs_approval` and request id.

## `@loom-agent/providers`

- `MockProvider`: deterministic provider for local tests.
- `OpenAICompatibleProvider`: non-streaming Chat Completions adapter.

## `@loom-agent/context`

`ContextCompiler.compile(input)` prioritizes system, goal, runtime, skills, memory, tools, recovery, messages, and files under a character budget. Goal and available tools are required sources.

## `@loom-agent/skills`

`SkillRuntime.discover`, `get`, and `load` parse project `SKILL.md` files.

## `@loom-agent/mcp`

`McpClient.connect`, `definitions`, `call`, and `close` implement the current stdio adapter. `mcpTools(client)` converts definitions into Loom tools.

## Stability

Package APIs are pre-1.0 and may change. SQLite migrations are designed to be forward-applied; TypeScript API compatibility is not yet guaranteed across milestones.
