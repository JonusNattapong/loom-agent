---
title: Getting started
version: 1.0
category: tutorial
---

# Getting started

Loom V1.0 is a unified agent platform: install it, define an agent application
with the stable public SDK, run it locally or remotely, observe it through the
control plane, and extend it via providers/tools/skills/bots — all through
versioned public contracts.

## 0. Quickstart with the public SDK (new in V1.0)

```bash
npm install @loom/sdk
```

```ts
import {createLoomApp, defineAgent} from "@loom/sdk";

const app = createLoomApp({
  name: "hello",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [defineAgent({id: "main", role: "planner", goal: "Say hello"})],
});
const agent = await app.run({goal: "Say hello", agent: "main"});
console.log(agent.status, agent.result);
await app.stop();
```

The default provider is `mock` (deterministic, no network). Set
`LOOM_PROVIDER=openai` and `LOOM_API_KEY` for real model output. See
`docs/sdk.md` and `examples/`.

## 1. Build and verify from source

```bash
bun install
npm run build
bun x vitest run --config vitest.config.ts
```

## 2. Run a goal

```bash
npm run loom -- run "fix all failing tests" --max-agents 2
```

The command prints a root agent id, plan id, agent tree, and final status. Loom delegates graph tasks to role-scoped children.

The default provider is `mock`. It is deterministic and useful for testing orchestration, but it does not independently understand or repair a real defect. Configure the OpenAI-compatible provider for real model output.

## 3. Inspect durable state

```bash
npm run loom -- ps
npm run loom -- agents <root-agent-id>
npm run loom -- inspect <agent-id>
npm run loom -- delegations <root-agent-id>
npm run loom -- messages <child-agent-id>
npm run loom -- trace <agent-id>
```

Add `--json` to any of these commands for structured output.

## 4. Exercise interruption and recovery

```bash
npm run loom -- run "fix all failing tests" --max-tasks 3
npm run loom -- inspect <agent-id>
npm run loom -- resume <agent-id>
```

The first command pauses after three child executions. Resume reloads agents, graph state, delegations, leases, messages, checkpoints, approvals, and results instead of creating a new plan or duplicate child.

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
