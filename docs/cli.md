---
title: CLI reference
version: 0.3
category: reference
---

# CLI reference

During development, invoke the CLI as `npm run loom -- <command>`. After linking or installing the package, use `loom <command>`.

## Global options

| Option | Behavior |
| --- | --- |
| `--json` | Print structured JSON where supported. |
| `--max-tasks <n>` | Pause after `n` executed tasks. Supported by `run` and `resume`. |
| `--skill <name>` | Parsed by the CLI for compatibility. V0.3 task-graph execution does not yet inject the selected skill; see known limitations. |

## Commands

| Command | Purpose |
| --- | --- |
| `run <goal>` | Create an agent, build a persisted plan, execute runnable tasks, and verify results. |
| `ps` | List agents in reverse creation order. |
| `inspect <agent-id>` | Show agent, graph, current task, checkpoint, artifacts, and approvals. |
| `resume <agent-id>` | Continue the latest plan for an agent or fall back to the V0.2 checkpoint loop. |
| `trace <agent-id>` | Print ordered trace events. |
| `approvals [agent-id]` | List all approval requests or filter by agent. |
| `approve <request-id>` | Persist an approved decision. Run `resume` afterward. |
| `deny <request-id>` | Persist a denied decision. The affected plan fails on resume. |
| `skills` | Discover project skills. |
| `skills show <name>` | Show parsed skill metadata and instructions. |
| `tools` | List native and successfully discovered MCP tools. |
| `memory <agent-id>` | List working-memory entries. |
| `memory set <agent-id> <key> <value>` | Upsert a memory entry. |
| `memory delete <agent-id> <key>` | Delete a memory entry. |
| `config` | Print effective project config plus environment-selected provider/model. |

## Exit behavior

Invalid commands, missing records, provider failures, and unhandled execution errors set a non-zero process exit code. A plan may legitimately return `waiting`, `paused`, or `failed` while the CLI process itself completed normally; inspect the printed plan status rather than relying only on the process exit code.
