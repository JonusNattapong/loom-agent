# Loom Agent

Loom is a CLI-first **local durable multi-agent runtime** for developer tasks. V0.4 coordinates a root planner and bounded child agents through persisted task graphs, delegation, task leases, an internal A2A message bus, isolated context and memory, structured result handoff, verified execution, approvals, and crash recovery.

> Milestone: **Loom Agent V0.4 — Multi-Agent & A2A Runtime**

V0.4 remains local and single-process. It does not include remote workers, distributed networking, a daemon, scheduler, web UI, desktop UI, vector memory, or a security sandbox.

## Requirements

- Node.js 22 or newer
- Bun 1.x for installation and development
- Git for repository inspection and diff review

## Quickstart

```bash
bun install
npm run build
npm test
npm run eval

npm run loom -- run "fix all failing tests" --max-agents 2
npm run loom -- agents
npm run loom -- inspect <root-agent-id>
```

Loom stores state in `.loom/loom.db`. Set `LOOM_DB` to use an isolated database.

## Agent tree and recovery

```bash
npm run loom -- run "create a release note" --max-agents 2 --max-tasks 1
npm run loom -- agents <root-agent-id>
npm run loom -- delegations <root-agent-id>
npm run loom -- messages <child-agent-id>
npm run loom -- trace <root-agent-id>
npm run loom -- resume <root-agent-id>
```

`loom inspect` shows the root plan, agent tree, task owners, delegations, artifacts, approvals, failures, and latest task checkpoint. Resume reconstructs unfinished children and consumes persisted results without creating duplicate delegations.

## Approval flow

Set a tool permission to `ask` in `.loom/config.json`. A restricted child pauses with a durable approval record.

```bash
npm run loom -- approvals <root-agent-id>
npm run loom -- approve <request-id>
npm run loom -- resume <root-agent-id>
```

Use `deny` to reject the operation. Role tool policies can only narrow project permissions; child agents do not bypass V0.3 tool middleware.

## Documentation

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Local multi-agent runtime](docs/multi-agent.md)
- [Delegation, leasing, and result handoff](docs/delegation.md)
- [Local A2A message bus](docs/a2a.md)
- [Multi-agent recovery and cancellation](docs/multi-agent-recovery.md)
- [CLI reference](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Task graph and verification](docs/task-graph.md)
- [State and migrations](docs/state-and-recovery.md)
- [Tracing](docs/tracing.md)
- [Security](docs/security.md)
- [Evaluation harness](docs/evals.md)
- [Package API reference](docs/api-reference.md)
- [Known limitations](docs/limitations.md)

Additional provider, skills, MCP, and development guides are under [`docs/`](docs/). Agent-oriented entry points are [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt).

## License

No license file is currently included. Treat the repository as source-available only until the project adds one.

## V0.6 adaptive execution

Loom now includes model-assisted planning, capability-aware deterministic routing, bounded multi-round provider execution, semantic review, repair-ready review results, and targeted verification in `@loom/adaptive`. Runtime policy remains authoritative: model output is validated, tool permissions and approvals are unchanged, and deterministic fallback is used when structured model output is unavailable. See `docs/adaptive-planning.md`, `docs/semantic-review.md`, `docs/model-routing.md`, and `docs/verification.md`.

## V0.7 daemon and background runtime

Loom V0.7 adds a durable local foreground daemon, SQLite-backed jobs and schedules, transactional occurrence dedupe, leases, bounded retries, restart recovery, and CLI inspection. Scheduled work enters the same adaptive orchestration pipeline as `loom run`; this is a restart-resumable local runtime, not a distributed scheduler or exactly-once network system. See `docs/daemon.md`, `docs/jobs.md`, `docs/scheduler.md`, and `docs/background-runtime.md`.
