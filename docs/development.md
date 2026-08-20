---
title: Development guide
version: 0.4
category: how-to
---

# Development guide

## Commands

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts
npm run eval
npm run loom -- config
```

The build uses TypeScript project references. Tests live beside source files and use Vitest. `dist`, SQLite files, and TypeScript build metadata are ignored.

## Package dependency direction

Keep shared contracts in `core`. State depends on core. Planner depends on state/core. Coordinator depends on planner, context, state, and core. CLI wires concrete providers and tools. Avoid importing CLI code from library packages.

## Adding a migration

Append a numbered `applyMigration` call. Never rewrite an applied migration. Use `CREATE TABLE IF NOT EXISTS` or a deterministic alteration, then add a test that opens an older schema and verifies the new records.

## Adding a task-graph behavior

1. Add or extend the shared state type.
2. Persist the transition in `StateStore`.
3. Implement graph behavior in `@loom-agent/planner` or multi-agent ownership/recovery in `@loom-agent/coordinator`.
4. Add a focused unit test and, when user-visible, a fixed eval scenario.
5. Update CLI output and documentation.

## Pull-request checks

Before review, require a clean build, all Vitest tests, all eval scenarios, `git diff --check`, and a manual `run --max-tasks`, `inspect`, and `resume` flow.
