# Loom

Loom is a CLI-first, single-agent durable harness written in TypeScript. V0.2 adds compiled context, selectable skills, structured working memory, an OpenAI-compatible provider, MCP stdio tools, stronger tool middleware, SQLite migrations, and safer recovery bookkeeping.

It intentionally does not include a web or desktop UI, multi-agent orchestration, a daemon, scheduler, vector memory, embeddings, or a security sandbox.

## Quickstart

Requirements: Node.js 22+ (for the built-in SQLite runtime) and optionally Bun 1.x for development.

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts

npm run loom -- run "inspect this repository"
npm run loom -- ps
npm run loom -- inspect <agent-id>
npm run loom -- trace <agent-id>
npm run loom -- resume <agent-id>
```

The default database is `.loom/loom.db`; set `LOOM_DB` for another SQLite file. V0.1 databases migrate in place and are not deleted.

## Configuration

Copy `.loom/config.example.json` to `.loom/config.json`. Precedence is CLI selection, then environment variables, then project config, then defaults. `LOOM_PROVIDER=openai`, `OPENAI_API_KEY`, `LOOM_MODEL`, and optional `OPENAI_BASE_URL` configure the real provider. The mock provider remains the default and never needs credentials.

```bash
loom config
loom run "fix the tests" --skill testing
```

## Skills, memory, and tools

Project skills are inspectable Markdown files under `.loom/skills/<name>/SKILL.md`.

```bash
loom skills
loom skills show code-review
loom memory <agent-id>
loom memory set <agent-id> hypothesis "the parser is dropping stderr"
loom memory delete <agent-id> hypothesis
loom tools
```

Native tools are workspace-scoped: `read_file`, `write_file`, and `shell`. Path traversal and symlink escapes are rejected. Shell commands run in the workspace with a timeout, output limit, exit status, and duration. Permission policies can be `allow`, `deny`, or `ask`; `ask` is denied unless an interactive approval layer is explicitly enabled.

MCP stdio servers can be configured under `mcpServers` in `.loom/config.json`; discovered tools use the same registry and middleware as native tools.

## Development

```bash
npm run build
bun x vitest run --config vitest.config.ts
```

See [docs/architecture.md](docs/architecture.md), [docs/state-and-recovery.md](docs/state-and-recovery.md), [docs/skills.md](docs/skills.md), and [docs/mcp.md](docs/mcp.md).
