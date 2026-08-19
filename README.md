# Loom

Loom is a small, durable single-agent harness written in TypeScript. V0.1 is intentionally focused: one local process, SQLite state/checkpoints, a provider interface with a deterministic mock provider, native tools, trace recording, and a CLI. Multi-agent, memory, web, desktop, daemon, and scheduling are out of scope for this version.

## Quickstart

Requirements: Node.js 20+ and optionally Bun 1.x for development.

```bash
npm install
npm run build
npm test
npm run loom -- run "summarize this repository"
npm run loom -- ps
npm run loom -- inspect <agent-id>
npm run loom -- trace <agent-id>
npm run loom -- resume <agent-id>
```

The default database is `.loom/loom.db`. Set `LOOM_DB` to use another SQLite file, which is useful for tests or separate projects. The same commands can be run with Bun, for example `bun run packages/cli/src/index.ts ps`.

## Packages

- `@loom/core`: shared types and provider/tool contracts
- `@loom/state`: SQLite durable state, checkpoints, and traces
- `@loom/providers`: provider implementations (V0.1 includes `MockProvider`)
- `@loom/tools`: registry, executor, and `read_file`, `write_file`, `shell`
- `@loom/runtime`: `AgentLoop` orchestration
- `@loom/cli`: the `loom` command

Native tools are workspace-scoped by default. Shell commands have a 30-second default timeout, capped at two minutes, and all tools expose basic permission hooks.
