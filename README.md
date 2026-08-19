# Loom Agent

Loom is a CLI-first, durable single-agent harness for developer tasks. V0.3 persists a task graph, separates planning from execution and verification, pauses for durable approvals, records task checkpoints and artifacts, and refuses to mark a plan complete until reviewer checks pass.

> Milestone: **Loom Agent V0.3 — Task Graph & Verified Execution**

Loom V0.3 does not include multi-agent orchestration, a daemon, scheduler, web UI, desktop UI, vector memory, or a security sandbox.

## Requirements

- Node.js 22 or newer
- Bun 1.x for dependency installation and development commands
- Git for repository inspection and diff review

## Quickstart

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts
npm run eval

npm run loom -- run "fix all failing tests"
npm run loom -- ps
npm run loom -- inspect <agent-id>
```

Loom stores durable state in `.loom/loom.db`. Override it with `LOOM_DB` when you need an isolated database.

## Crash and resume

`--max-tasks` provides a deterministic interruption point for development and evaluation:

```bash
npm run loom -- run "fix all failing tests" --max-tasks 3
npm run loom -- inspect <agent-id>
npm run loom -- resume <agent-id>
```

`loom inspect` displays the persisted plan, task status, current task, latest `cp_...` checkpoint, retry information, blocked reason, and tracked artifacts.

## Approval flow

Set a tool permission to `ask` in `.loom/config.json`. Loom creates a durable request and moves the plan to `waiting`.

```bash
npm run loom -- approvals
npm run loom -- approve <request-id>
npm run loom -- resume <agent-id>
```

Use `loom deny <request-id>` to reject the operation. Denial fails the affected plan without replaying the tool call.

## Documentation

- [Getting started](docs/getting-started.md)
- [CLI reference](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Task graph and verification](docs/task-graph.md)
- [State, schema, and recovery](docs/state-and-recovery.md)
- [Providers](docs/providers.md)
- [Skills](docs/skills.md)
- [MCP](docs/mcp.md)
- [Tracing and observability](docs/tracing.md)
- [Security model](docs/security.md)
- [Evaluation harness](docs/evals.md)
- [Package API reference](docs/api-reference.md)
- [Development guide](docs/development.md)
- [Known limitations](docs/limitations.md)

Agent-oriented entry points are available in [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt).

## License

No license file is currently included. Treat the repository as source-available only until the project adds one.
