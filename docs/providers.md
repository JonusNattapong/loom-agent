---
title: Providers
version: 1.1
category: how-to
---

# Providers

## Mock provider

`MockProvider` is the default. It returns deterministic text derived from the first user message. Use it for tests, eval orchestration, approvals, recovery, and CLI development. It does not repair real code.

## OpenAI-compatible provider

PowerShell:

```powershell
$env:LOOM_PROVIDER = "openai"
$env:OPENAI_API_KEY = "..."
$env:LOOM_MODEL = "gpt-4o-mini"
npm run loom -- run "inspect this repository"
```

POSIX shell:

```bash
LOOM_PROVIDER=openai OPENAI_API_KEY=... LOOM_MODEL=gpt-4o-mini \
  npm run loom -- run "inspect this repository"
```

Set `OPENAI_BASE_URL` for another service implementing the OpenAI Chat Completions shape.

The adapter normalizes assistant content, function tool calls, usage, finish reason, request id, and model metadata. The provider remains non-streaming, while adaptive execution supports bounded multi-round tool calls with durable checkpoints. Explicit provider registration is recommended when applications need different models per agent.

Normal tests never require network access or credentials. Do not print, trace, or persist provider keys.
