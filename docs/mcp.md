---
title: MCP tool integration
version: 0.4
category: how-to
---

# MCP tool integration

Configure stdio servers under `mcpServers` in `.loom/config.json`:

```json
{
  "mcpServers": {
    "example": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {"EXAMPLE_MODE": "safe"}
    }
  }
}
```

At startup Loom spawns each configured command, sends MCP `initialize`, requests `tools/list`, converts discovered schemas to Loom `ToolDefinition` records, and registers adapters in the shared `ToolRegistry`. Calls use `tools/call`, and text content is normalized into a string.

```bash
npm run loom -- tools
```

An unavailable MCP server is reported on stderr; native tools remain available. MCP tool calls pass through the same permission and execution middleware as native tools.

V0.4 supports line-delimited JSON-RPC over stdio only. It does not implement HTTP/SSE transports, request timeouts, reconnection, cancellation, progress notifications, or a full MCP lifecycle manager. MCP commands inherit the Loom process environment and are not sandboxed. Role policy may restrict which child receives an MCP tool.
