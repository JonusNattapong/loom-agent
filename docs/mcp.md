# MCP

Configure stdio MCP servers in `.loom/config.json` under `mcpServers`. Loom starts a configured command, performs MCP initialization, discovers tools, and adapts them into the same `ToolRegistry` used by native tools. MCP failures are reported and do not prevent the CLI from using native tools.

MCP commands run with the Loom process environment. Do not place secrets in committed configuration.
