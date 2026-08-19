---
title: State, schema, and recovery
version: 0.4
category: reference
---

# State, schema, and recovery

## Database location

The default SQLite file is `.loom/loom.db`. `LOOM_DB=:memory:` creates a process-local test database. A filesystem path creates missing parent directories.

Node uses `node:sqlite`; Bun uses `bun:sqlite`. WAL mode is requested where the runtime supports the pragma wrapper.

## Migrations

Migrations are append-only and tracked in `schema_migrations`:

| Version | Tables |
| --- | --- |
| 1 | `agents`, `traces`, `checkpoints` |
| 2 | `working_memory`, `tool_execution_ledger` |
| 3 | `plans`, `plan_tasks`, `approval_requests`, `artifacts` |
| 4 | `task_checkpoints` |
| 5 | Agent relationship columns, task lease columns, artifact/approval/trace correlation columns, `delegations`, `agent_messages`, `agent_results`, `task_leases`, `scoped_memory`, `coordination_decisions` |

Migration 5 alters the V0.3 tables in place, backfills legacy agents as root `general` agents, and preserves previous records. The migration runs in a SQLite transaction and has a dedicated V0.3 upgrade test.

## Durable records

- `agents`: identity, role, root/parent relationship, goal, lifecycle status, result, and error.
- `plans`: agent goal, plan status, and current phase.
- `plan_tasks`: graph node, dependencies, retry policy, owner, lease, result, and blocked reason.
- `task_checkpoints`: `cp_...` id, task, phase, step, and JSON snapshot.
- `artifacts`: file path and operation linked to agent, task, and checkpoint.
- `approval_requests`: normalized tool input and durable decision.
- `tool_execution_ledger`: requested tool input and execution outcome keyed by tool-call id.
- `working_memory` and `scoped_memory`: compatibility memory plus isolated agent/root-task/project state.
- `delegations`: durable parent-child task assignments and outcomes.
- `agent_messages`: internal A2A delivery and acknowledgement state.
- `agent_results`: structured result summaries keyed uniquely by delegation.
- `task_leases`: active and historical ownership records.
- `coordination_decisions`: persisted retry, repair, reassignment, and human-intervention choices.
- `traces`: ordered events with root/agent/task/delegation/message/tool/checkpoint correlation.
- `checkpoints`: V0.2-compatible message checkpoints.

## Crash recovery

`loom resume <root-agent-id>` reconstructs the agent tree and newest plan. It consumes persisted child results once, reuses unfinished children, reconciles leases, and resumes the child associated with an approved request. Denied tasks fail without replay.

The tool ledger reuses a persisted `succeeded` result. It refuses to replay `executing` or `unknown` calls automatically because the side effect may already have occurred. See [multi-agent recovery](multi-agent-recovery.md) for hierarchy rules.

## Backup

Stop Loom processes before copying `.loom/loom.db` for a consistent manual backup. Back up associated WAL files if a process is active. V0.4 does not provide a built-in export, compaction, or restore command.
