---
title: Tracing and observability
version: 0.3
category: reference
---

# Tracing and observability

Trace records are ordered by SQLite id and include `agentId`, event type, JSON data, and timestamp.

```bash
npm run loom -- trace <agent-id>
npm run loom -- trace <agent-id> --json
```

## V0.3 graph events

- `agent.created`
- `plan.created`
- `task.started`
- `task.completed`
- `task.retrying`
- `verification.passed`
- `verification.rejected`
- `checkpoint.created`
- `agent.paused`
- `agent.recovering`
- `plan.completed`
- `approval.approved`
- `approval.denied`

## Compatibility runtime events

- `agent.started`, `agent.completed`, `agent.failed`
- `context.compile.started`, `context.source.truncated`, `context.compile.completed`
- `skill.loaded`
- `provider.request`, `provider.response`
- `tool.requested`, `tool.executing`, `tool.completed`, `tool.failed`

## MCP events

- `mcp.connect.started`, `mcp.connect.completed`
- `mcp.tool.discovered`, `mcp.tool.called`, `mcp.tool.failed`

Trace data is operational metadata, not a secret-safe audit sink. Avoid adding credentials or full sensitive file content to trace payloads.
