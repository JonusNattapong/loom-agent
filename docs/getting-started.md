---
title: Getting started
version: 0.3
category: tutorial
---

# Getting started

This tutorial runs Loom with its deterministic mock provider, inspects the generated plan, pauses partway through execution, and resumes from SQLite state.

## 1. Install and verify

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts
```

## 2. Run a goal

```bash
npm run loom -- run "fix all failing tests"
```

The command prints an agent id, plan id, and final status. The coding-task plan contains repository inspection, baseline tests, diagnosis, implementation, targeted tests, full tests, and diff review.

The default provider is `mock`. It is deterministic and useful for testing orchestration, but it does not independently understand or repair a real defect. Configure the OpenAI-compatible provider for real model output.

## 3. Inspect durable state

```bash
npm run loom -- ps
npm run loom -- inspect <agent-id>
npm run loom -- trace <agent-id>
```

Add `--json` to any of these commands for structured output.

## 4. Exercise interruption and recovery

```bash
npm run loom -- run "fix all failing tests" --max-tasks 3
npm run loom -- inspect <agent-id>
npm run loom -- resume <agent-id>
```

The first command pauses before the fourth runnable task. Resume reloads the graph, checkpoints, approvals, and task status from SQLite instead of creating a new plan.

## 5. Use an isolated database

PowerShell:

```powershell
$env:LOOM_DB = "$PWD/.loom/tutorial.db"
npm run loom -- ps
```

POSIX shell:

```bash
LOOM_DB="$PWD/.loom/tutorial.db" npm run loom -- ps
```

Remove only the isolated tutorial database when you no longer need it. Do not delete `.loom/loom.db` if it contains work you want to resume.
