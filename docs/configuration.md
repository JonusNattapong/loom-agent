---
title: Configuration
version: 0.4
category: how-to
---

# Configuration

Create `.loom/config.json` in the project root. Start from `.loom/config.example.json`:

```json
{
  "provider": "mock",
  "model": "gpt-4o-mini",
  "context": {"maxChars": 50000},
  "agents": {"maxConcurrent": 2},
  "permissions": {
    "read_file": "allow",
    "write_file": "ask",
    "shell": "ask"
  },
  "mcpServers": {}
}
```

## Effective precedence

For provider and model selection:

```text
environment variables > .loom/config.json > defaults
```

V0.4 does not provide `--provider` or `--model` CLI flags.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `LOOM_DB` | SQLite database path | `.loom/loom.db` |
| `LOOM_PROVIDER` | `mock` or `openai` | project config, then `mock` |
| `LOOM_MODEL` | OpenAI-compatible model name | project config, then `gpt-4o-mini` |
| `OPENAI_API_KEY` | Provider credential | none |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |

Do not commit `.loom/config.json` if it contains machine-specific commands or environment values. Never place API keys in config; use the process environment.

## Context budget

`context.maxChars` limits each isolated child context and the V0.2-compatible `AgentLoop` context.

## Agent concurrency

`agents.maxConcurrent` bounds child execution and defaults to 2. `--max-agents` overrides it for one command. V0.4 does not start remote workers or background processes.

## Permission values

- `allow`: execute immediately.
- `deny`: fail as `non_retryable`.
- `ask`: persist an approval request and pause as `needs_approval`.

Permissions are keyed by normalized tool name, including MCP tool names.
