---
title: CLI reference
version: 1.0
category: reference
---

# CLI reference

During development, invoke the CLI as `npm run loom -- <command>`. Use `npm run dev` to launch the interactive TUI REPL directly. After linking or installing the package, use `loom <command>`.

## Global options

| Option | Behavior |
| --- | --- |
| `--json` | Print structured JSON where supported. |
| `--max-tasks <n>` | Pause after `n` executed tasks. Supported by `run` and `resume`. |
| `--max-agents <n>` | Bound concurrent child execution for `run` and `resume`. Default: config, then 2. |
| `--skill <name>` | Parsed for the compatibility runtime. V0.4 graph children do not inject it yet. |

## Commands

| Command | Purpose |
| --- | --- |
| `repl` | Start an interactive TUI REPL session with live multi-agent execution, streaming thoughts, tool approvals, and slash commands. |
| `run <goal>` | Create a root planner, persist a plan, delegate tasks, and verify results. |
| `ps` | List root agents in reverse creation order. |
| `agents [root-id]` | List all agents or one durable agent tree. |
| `agent inspect <agent-id>` | Inspect a root or child with its graph and coordination records. |
| `agent cancel <agent-id>` | Cancel an agent and active descendants. |
| `inspect <agent-id>` | Show root plan, agent tree, task owners, checkpoint, artifacts, and approvals. |
| `resume <root-agent-id>` | Reconstruct and continue multi-agent work; legacy agents use the compatibility path. |
| `trace <agent-id>` | Print the correlated root timeline for a root or local trace for a child. |
| `delegations <agent-id>` | List root-wide or agent-local delegation records. |
| `messages <agent-id>` | List durable A2A messages for an agent. |
| `approvals [agent-id]` | List all approval requests or filter by agent. |
| `approve <request-id>` | Persist an approved decision. Run `resume` afterward. |
| `deny <request-id>` | Persist a denied decision. The affected plan fails on resume. |
| `skills` | Discover project skills. |
| `skills show <name>` | Show parsed skill metadata and instructions. |
| `tools` | List native and successfully discovered MCP tools. |
| `memory <agent-id>` | List memory visible to that agent. |
| `memory set <agent-id> <key> <value>` | Upsert a memory entry. |
| `memory delete <agent-id> <key>` | Delete a memory entry. |
| `config` | Print effective project config plus environment-selected provider/model. |
| `init [name]` | Scaffold a `.loom/config.json` (V1 schema) in the current directory. |
| `doctor [--json]` | Diagnose Node version, database access, migration, config validity, provider, control-plane, and remote-worker configuration. |
| `version` / `--version` | Print Loom, SDK, protocol, schema, and Node versions. |
| `config validate` | Validate `.loom/config.json` against the V1 schema and print errors with JSON-pointer-style paths. |


## Exit behavior

Invalid commands, missing records, provider failures, and unhandled execution errors set a non-zero process exit code. A plan may legitimately return `waiting`, `paused`, or `failed` while the CLI process itself completed normally; inspect the printed plan status rather than relying only on the process exit code.
