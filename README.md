# Loom

Loom is a CLI-first, single-agent durable harness written in TypeScript. V0.3 adds persisted task graphs, explicit plan/execute/verify phases, reviewer-gated completion, durable approvals, task checkpoints, artifact tracking, failure policies, and a repeatable eval harness.

It intentionally does not include a web or desktop UI, multi-agent orchestration, a daemon, scheduler, vector memory, embeddings, or a security sandbox.

## Quickstart

Requirements: Node.js 22+ and optionally Bun 1.x for development.

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts
npm run eval

npm run loom -- run "fix all failing tests"
npm run loom -- ps
npm run loom -- inspect <agent-id>
npm run loom -- trace <agent-id>
npm run loom -- resume <agent-id>
```

The default database is `.loom/loom.db`; set `LOOM_DB` for another SQLite file. Existing databases migrate in place. `loom inspect` displays the plan, tasks, current task, latest `cp_...` checkpoint, retries, blocked reasons, and modified artifacts.

To exercise durable interruption deterministically:

```bash
loom run "fix all failing tests" --max-tasks 3
loom inspect <agent-id>
loom resume <agent-id>
```

## Approvals

Permissions can be `allow`, `deny`, or `ask` in `.loom/config.json`. An `ask` tool call creates a durable request and pauses the task.

```bash
loom approvals
loom approve <request-id>
loom deny <request-id>
loom resume <agent-id>
```

## Configuration and providers

Copy `.loom/config.example.json` to `.loom/config.json`. Precedence is CLI selection, environment variables, project config, then defaults. `LOOM_PROVIDER=openai`, `OPENAI_API_KEY`, `LOOM_MODEL`, and optional `OPENAI_BASE_URL` configure the real provider. The deterministic mock remains the default.

## Skills, memory, and tools

```bash
loom skills
loom skills show code-review
loom memory <agent-id>
loom memory set <agent-id> hypothesis "the parser is dropping stderr"
loom tools
loom config
```

Native tools are workspace-scoped. Path traversal and symlink escapes are rejected. Shell commands run with the Loom process permissions, so Loom is not a security sandbox.

See [docs/task-graph.md](docs/task-graph.md), [docs/architecture.md](docs/architecture.md), [docs/state-and-recovery.md](docs/state-and-recovery.md), [docs/skills.md](docs/skills.md), and [docs/mcp.md](docs/mcp.md).
