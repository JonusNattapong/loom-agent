---
title: Architecture
version: 0.4
category: explanation
---

# Architecture

Loom V0.4 adds a coordination layer around the V0.3 task graph. The existing single-agent `VerifiedExecutionRuntime` remains available for migrated agents and compatibility tests.

```mermaid
flowchart TD
  CLI[CLI] --> Coordinator[MultiAgentRuntime]
  Coordinator --> Plan[Plan Engine / Task Graph]
  Coordinator --> Roles[Role Registry]
  Coordinator --> Context[Agent Context Compiler]
  Coordinator --> Bus[Durable A2A Bus]
  Coordinator --> Lease[Task Leasing]
  Coordinator --> Children[Bounded Child Agents]
  Children --> Provider[Provider]
  Children --> Tools[Tool Middleware]
  Tools --> Native[Native Tools]
  Tools --> MCP[MCP Tools]
  Plan & Bus & Lease & Children & Tools --> State[State Store]
  State --> SQLite[(SQLite)]
```

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `@loom/core` | Shared lifecycle, delegation, message, result, lease, memory, and trace contracts. |
| `@loom/state` | SQLite migrations v1–v5, transactions, durable records, and queries. |
| `@loom/planner` | Plan creation, dependency scheduling, V0.3 verified execution, retries, and recovery. |
| `@loom/coordinator` | Agent registry operations, roles, context isolation, A2A bus, delegation, bounded coordination, recovery, and cancellation. |
| `@loom/tools` | Tool registry, permissions, approvals, idempotency, result limits, and native tools. |
| `@loom/providers` | Mock and OpenAI-compatible provider normalization. |
| `@loom/context` | Priority-based context compilation. |
| `@loom/skills` | Project skill discovery. |
| `@loom/mcp` | Stdio MCP discovery and tool adaptation. |
| `@loom/runtime` | V0.2-compatible `AgentLoop`. |
| `@loom/evals` | V0.3 regression and V0.4 multi-agent scenarios. |
| `@loom/cli` | Config, service wiring, commands, and output. |

## Coordination sequence

```mermaid
sequenceDiagram
  participant U as User
  participant C as Coordinator
  participant S as SQLite
  participant A as Child Agent
  participant R as Root Agent
  U->>C: loom run goal
  C->>S: persist root, plan, tasks
  C->>S: atomically create child + delegation
  C->>S: acquire task lease
  C->>A: isolated task context
  A->>S: tool ledger, traces, artifacts
  A->>S: persist structured result + A2A message
  C->>R: deliver summary exactly once
  R->>S: acknowledge and update graph
  C->>S: verification or repair decision
```

SQLite is the source of truth. Runtime objects are disposable projections. V0.4 uses synchronous SQLite transactions and bounded asynchronous workers inside one process; it is not a distributed system.
