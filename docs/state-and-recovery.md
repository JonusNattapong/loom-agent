---
title: State, schema, and recovery
version: 0.3
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

Statements use `CREATE TABLE IF NOT EXISTS`, allowing V0.1 and V0.2 databases to upgrade without deletion.

## Durable records

- `agents`: goal, lifecycle status, result, and error.
- `plans`: agent goal, plan status, and current phase.
- `plan_tasks`: graph node, dependencies JSON, retry budget, failure policy, result, and blocked reason.
- `task_checkpoints`: `cp_...` id, task, phase, step, and JSON snapshot.
- `artifacts`: file path and operation linked to agent, task, and checkpoint.
- `approval_requests`: normalized tool input and durable decision.
- `tool_execution_ledger`: requested tool input and execution outcome keyed by tool-call id.
- `working_memory`: per-agent key/value state.
- `traces`: ordered observability events.
- `checkpoints`: V0.2-compatible message checkpoints.

## Crash recovery

`loom resume <agent-id>` loads the newest plan for the agent. Completed tasks are not rerun. Paused tasks continue from graph state. Approved tasks move from `needs_approval` to `ready`; denied tasks fail without replay.

The tool ledger reuses a persisted `succeeded` result. It refuses to replay `executing` or `unknown` calls automatically because the side effect may already have occurred.

## Backup

Stop Loom processes before copying `.loom/loom.db` for a consistent manual backup. Back up associated WAL files if a process is active. V0.3 does not provide a built-in export, compaction, or restore command.
