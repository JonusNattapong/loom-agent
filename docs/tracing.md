---
title: Tracing and observability
version: 0.4
category: reference
---

# Tracing and observability

Trace records are ordered by SQLite id and support `rootAgentId`, `agentId`, `parentAgentId`, `taskId`, `delegationId`, `messageId`, `toolCallId`, `checkpointId`, event data, and timestamp.

```bash
npm run loom -- trace <agent-id>
npm run loom -- trace <agent-id> --json
```

For a root id, `trace` returns the correlated tree timeline. For a child id, it returns that agent's local events.

## V0.4 coordination events

- `agent.spawned`, `agent.started`, `agent.completed`, `agent.failed`, `agent.cancelled`
- `delegation.created`, `delegation.assigned`, `delegation.completed`, `delegation.failed`
- `message.sent`, `message.delivered`, `message.acknowledged`
- `task.leased`, `task.released`, `task.reassigned`
- `result.handoff`

## Task graph events

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
