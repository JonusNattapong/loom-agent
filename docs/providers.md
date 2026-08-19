---
title: Providers
version: 0.4
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

The adapter normalizes assistant content, function tool calls, usage, finish reason, request id, and model metadata. V0.4 remains non-streaming and supports one provider tool-execution round followed by one final provider call. Children share the configured provider/model by default.

Normal tests never require network access or credentials. Do not print, trace, or persist provider keys.
