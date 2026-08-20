# @loom/sdk

Public developer SDK for **Loom V1.0 — Unified Agent Platform**.

Loom is a durable agent platform: define agents, tools, and skills through
stable public contracts, run them locally or remotely, observe them through the
Control Plane, and extend the runtime with providers/tools/skills/bots.

> The SDK is a **thin, stable facade** over the existing durable Loom runtime.
> It does **not** introduce a second runtime: `createLoomApp` composes
> `StateStore`, `AgentLoop`, the tool/skill runtimes, the adaptive orchestrator,
> the daemon, and the control plane exactly as the CLI already does.

## Install

```bash
npm install @loom/sdk
```

Requires Node.js **>= 18.18** (LTS recommended).

## Quick start

```ts
import {
  defineAgent,
  defineTool,
  defineSkill,
  createLoomApp,
} from "@loom/sdk";

const coder = defineAgent({id: "coder", role: "coder", provider: "mock"});

const app = createLoomApp({
  name: "coding-team",
  agents: [coder],
  provider: {id: "mock"},
});

const result = await app.run({goal: "Write a hello world function"});
console.log(result.status, result.result);
```

### Embedded runtime (no CLI)

```ts
const app = await createLoomApp({agents: [coder], provider: {id: "mock"}});
const result = await app.run({goal: "..."});
await app.stop();
```

### Daemon / background mode

```ts
const app = createLoomApp({agents: [coder], provider: {id: "mock"}});
const {daemonId, controlUrl} = await app.start(); // durable job execution + control plane
// ... later
await app.stop();
```

## Extension registry

```ts
app.registerProvider(myProvider);
app.registerTool(defineTool({name: "ping", description: "ping", execute: async () => "pong"}));
app.registerSkill(defineSkill({name: "review", description: "code review"}));
app.registerBotAdapter(defineBot({id: "discord", agent: "assistant", transport}));
```

SDK tools run through the existing `ToolExecutor`, so they inherit
**permissions, approval, idempotency, tracing, result limits, and workspace
policy** — they cannot bypass the runtime's guardrails.

## Events

```ts
const off = app.onEvent((event) => console.log(event.type, event.agentId));
```

## API client

```ts
import {LoomClient} from "@loom/sdk/client";
const loom = new LoomClient({baseUrl: "http://127.0.0.1:4777"});
const {sessionToken, csrfToken} = await loom.login(operatorToken);
const jobs = await loom.jobs.list();
await loom.approvals.approve(approvalId);
```

## Compatibility policy

| API group | Stability | Promise |
| --- | --- | --- |
| `defineAgent`, `defineTool`, `defineSkill`, `defineBot`, `createLoomApp`, core contracts | **Stable** | Backward compatible within `1.x` |
| `/api/v1` Control API | **Stable** | No breaking changes within `1.x`; `/api/v2` only on major bump |
| Events (`LoomEvent`) | **Stable** | `eventVersion` included; new event types are additive |
| `WorldAdapter`, advanced route extensions | **Experimental** | May change within minor versions |

Breaking changes to **stable** public API require a **major** release.
Experimental APIs are clearly marked and may evolve within minor releases.

## What Loom is NOT (V1.0)

Loom V1.0 is a stable single-controller platform. It does **not** include
multi-controller HA, distributed consensus, distributed storage, full mesh
networking, NAT traversal (STUN/TURN/ICE), arbitrary P2P, or universal
exactly-once external side effects. It guarantees durable logical identities,
replay-safe supported operations, idempotent tool-ledger behavior, and a
lease/fencing authority for remote work.
