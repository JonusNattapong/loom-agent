---
title: SDK
version: 1.0
category: reference
---

# Loom SDK (`@loom-agent/sdk`)

The SDK is the **stable, public developer contract** for Loom V1.0. It is a
facade over the existing durable runtime — it does **not** introduce a second
runtime. `createLoomApp` composes `StateStore`, `AgentLoop`, the tool/skill
runtimes, the adaptive orchestrator, the daemon, and the control plane exactly
as the CLI already does.

## Stability tiers

A V1.0 API is a promise, not a barrel-file accident.

- **Public (stable):** `defineAgent`, `defineTool`, `defineSkill`, `defineBot`,
  `createLoomApp`, `defineLoomApp`, `LoomApp`, `SDK_API_VERSION`,
  `PROTOCOL_MAJOR`, `SCHEMA_VERSION`, and the exported contract *types*
  (`AgentDefinition`, `ToolDefinition`, `Provider`, `LoomEvent`, `LoomAddress`,
  `LoomRoute`, `WorkerCapability`, `BotDefinition`, `BotTransport`).
  Breaking changes require a new major version and a migration window.
- **Experimental (`@experimental`):** the Agent Arena `WorldAdapter` /
  `FakeWorldAdapter` foundation and remote-worker transport details. These may
  change within a minor release; they are clearly marked.
- **Internal:** anything under `@loom-agent/*/dist/internal/...` or `*/private`. Never
  import these from an application.

## Install

```bash
npm install @loom-agent/sdk
```

The SDK statically depends only on publishable packages
(`@loom-agent/core`, `@loom-agent/state`, `@loom-agent/tools`, `@loom-agent/skills`, `@loom-agent/providers`).
Heavy runtime packages (`@loom-agent/runtime`, `@loom-agent/daemon`, `@loom-agent/control`,
`@loom-agent/adaptive`, `@loom-agent/context`, `@loom-agent/remote`, `@loom-agent/bots`,
`@loom-agent/network`, `@loom-agent/coordinator`) are **optional peer dependencies** loaded
lazily by `app.run()` / `app.start()`. You only need them installed if you call
those methods.

## Minimal example

```ts
import {createLoomApp, defineAgent} from "@loom-agent/sdk";

const app = createLoomApp({
  name: "my-app",
  provider: {id: process.env.LOOM_PROVIDER ?? "mock"},
  agents: [defineAgent({id: "main", role: "planner", goal: "Say hello"})],
});

const agent = await app.run({goal: "Say hello", agent: "main"});
console.log(agent.status, agent.result);
await app.stop();
```

## API overview

| Symbol | Purpose |
| --- | --- |
| `createLoomApp(options)` | Build a `LoomApp` from options or a manifest. |
| `defineLoomApp(manifest)` | Build a `LoomApp` from a versioned manifest. |
| `defineAgent(input)` | Validate and declare an agent definition. |
| `defineTool(input)` | Declare a tool that runs through `ToolExecutor`. |
| `defineSkill(input)` | Declare a skill. |
| `defineBot(input)` | Declare a bot backed by a `BotTransport`. |
| `app.run({goal, agent})` | Run a goal with the embedded (in-process) runtime. |
| `app.start()` | Start the durable daemon + control plane. |
| `app.stop()` | Gracefully stop daemon + control plane. |
| `app.registerProvider/registerTool/registerSkill/registerBotAdapter` | Extend the app. |
| `app.onEvent(handler)` | Subscribe to stable `LoomEvent`s. |
| `app.version` | `{sdk, protocol, schema}` for compatibility checks. |

## Compatibility

- `SDK_API_VERSION` is the npm package version (`1.0.0`).
- `PROTOCOL_MAJOR` is the remote-worker protocol major (currently `1`).
- `SCHEMA_VERSION` is the SQLite migration version (currently `13`).

A worker advertising a different `PROTOCOL_MAJOR` is rejected at the handshake.
