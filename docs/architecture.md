---
title: Architecture
version: 0.3
category: explanation
---

# Architecture

Loom V0.3 is a single-process, single-agent runtime. Separation refers to responsibilities and phases, not separate autonomous agents.

```mermaid
flowchart TD
  CLI[CLI] --> Plan[Plan Engine]
  Plan --> Graph[Task Graph Runtime]
  Graph --> Executor[Task Executor]
  Graph --> Reviewer[Reviewer / Verification]
  Executor --> Provider[Provider]
  Executor --> Middleware[Tool Middleware]
  Middleware --> Native[Native Tools]
  Middleware --> MCP[MCP Tools]
  Graph --> State[State Store]
  Middleware --> State
  Reviewer --> State
  State --> SQLite[(SQLite)]
  Skills[Skills Runtime] --> Context[Context Compiler]
  Memory[Working Memory] --> Context
  Context --> Legacy[AgentLoop compatibility path]
```

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `@loom/core` | Shared contracts and lifecycle types. |
| `@loom/state` | SQLite loading, migrations, durable records, and queries. |
| `@loom/planner` | Plan creation, dependency scheduling, execution phases, retries, reviewer gating, and recovery. |
| `@loom/tools` | Tool registry, permissions, approvals, idempotency ledger, result limits, and native tools. |
| `@loom/providers` | Mock and OpenAI-compatible provider normalization. |
| `@loom/mcp` | Stdio MCP initialization, discovery, and tool adaptation. |
| `@loom/context` | Priority-based context compilation for the compatibility runtime. |
| `@loom/skills` | Project skill discovery and frontmatter parsing. |
| `@loom/runtime` | V0.2-compatible `AgentLoop` and context/provider loop. |
| `@loom/evals` | Fixed deterministic orchestration scenarios. |
| `@loom/cli` | Config loading, command parsing, service wiring, and output. |

## V0.3 execution path

```mermaid
sequenceDiagram
  participant U as User
  participant C as CLI
  participant P as Plan Engine
  participant G as Graph Runtime
  participant E as Executor
  participant R as Reviewer
  participant S as SQLite
  U->>C: loom run goal
  C->>S: create agent
  C->>P: create plan
  P->>S: persist tasks and dependencies
  loop runnable tasks
    G->>S: load graph state
    G->>E: execute task
    E->>S: persist result/checkpoint/artifacts
  end
  G->>R: verify targeted tests/full suite/diff
  alt verification passes
    R->>S: complete task and plan
  else verification fails
    R->>S: reopen dependency or fail plan
  end
```

SQLite is the durable source of truth. In-memory objects are projections of persisted state and may be recreated after process interruption.
