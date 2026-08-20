# Loom Agent

Loom is a CLI-first durable multi-agent runtime for developer tasks. **V0.9** adds an authenticated operator control plane and web UI, a versioned JSON/SSE API, stable `loom://` resource identities, and an inspectable route model on top of the existing planning, approvals, daemon, scheduler, and remote-worker runtime.

> Milestone: **Loom Agent V0.9 — Operator Control Plane & Logical Addressing**

Loom remains a controller-oriented runtime backed by local SQLite. V0.9 does not provide NAT traversal, P2P transport, a VPN, relay transport, a mesh, consensus, or distributed storage.

## Requirements

- Node.js 22 or newer
- Bun 1.x for installation and development
- Git for repository inspection and diff review

## Quick start

```bash
bun install
npm run build
npm run loom -- operator token create --name local-admin
npm run loom -- daemon start
```

The token is printed once. Open <http://127.0.0.1:4777> and paste it into the login page. Installed/package users can run `loom operator token create` and `loom daemon start` directly.

The control listener defaults to localhost (`127.0.0.1:4777`). `LOOM_CONTROL_HOST` and `LOOM_CONTROL_PORT` override `.loom/config.json`. Non-local listeners are refused unless native TLS, an HTTPS public origin, secure cookies, and an exact origin allowlist are all configured; see [Control plane](docs/control-plane.md).

Loom stores state in `.loom/loom.db`. Set `LOOM_DB` to use an isolated database.

## CLI execution and recovery

```bash
npm run loom -- run "fix all failing tests" --max-agents 2
npm run loom -- agents
npm run loom -- inspect <root-agent-id>
npm run loom -- trace <root-agent-id>
npm run loom -- resume <root-agent-id>
```

Set a tool permission to `ask` in `.loom/config.json` to create durable approval requests:

```bash
npm run loom -- approvals <root-agent-id>
npm run loom -- approve <request-id>
npm run loom -- resume <root-agent-id>
```

## Remote workers

Workers use authenticated outbound WebSockets and pre-provisioned local workspaces:

```bash
loom worker token create
LOOM_WORKER_TOKEN=... loom worker start --id worker-dev   --controller ws://127.0.0.1:4778/v1/workers/connect
```

Use `wss://` for remote deployments. Controller and worker policies intersect; a controller cannot grant a tool denied locally. Loom does not synchronize files. A connected worker has a transient controller-WebSocket route associated with its stable `loom://worker/<id>` identity.

## V0.9 documentation

- [Control plane and secure deployment](docs/control-plane.md)
- [Control API and SSE](docs/control-api.md)
- [Operator authentication](docs/operator-auth.md)
- [`loom://` addressing](docs/loom-addressing.md)
- [Route model](docs/routes.md)

## Other documentation

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Adaptive planning](docs/adaptive-planning.md)
- [Local multi-agent runtime](docs/multi-agent.md)
- [Daemon and jobs](docs/daemon.md)
- [Scheduler](docs/scheduler.md)
- [Remote deployment](docs/remote-deployment.md)
- [Security](docs/security.md)
- [Package API reference](docs/api-reference.md)
- [Known limitations](docs/limitations.md)

Additional guides are under [`docs/`](docs/). Agent-oriented entry points are [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt).

## License

No license file is currently included. Treat the repository as source-available only until the project adds one.
