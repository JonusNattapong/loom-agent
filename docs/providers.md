---
title: Providers
version: 1.1
category: how-to
---

# Providers

Loom includes native provider adapters with tool calling / function execution support across all major AI providers.

## 1. Mock Provider

`MockProvider` is the default when no provider or API key is specified. It returns deterministic responses derived from user prompts. Ideal for local unit testing, evaluation harnesses, and offline development.

```bash
LOOM_PROVIDER=mock
```

---

## 2. Anthropic Provider (Claude)

Native adapter for Anthropic Claude models (Claude 3.7 Sonnet, Claude 3.5 Haiku).

```bash
# PowerShell
$env:LOOM_PROVIDER = "anthropic"
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:LOOM_MODEL = "claude-3-7-sonnet-20250219"

# POSIX
LOOM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... LOOM_MODEL=claude-3-7-sonnet-20250219 \
  npm run loom -- repl
```

---

## 3. Google Gemini Provider

Native adapter for Google Gemini models (Gemini 2.5 Flash, Gemini 2.5 Pro).

```bash
# PowerShell
$env:LOOM_PROVIDER = "google"
$env:GEMINI_API_KEY = "AIzaSy..."
$env:LOOM_MODEL = "gemini-2.5-flash"

# POSIX
LOOM_PROVIDER=google GEMINI_API_KEY=AIzaSy... LOOM_MODEL=gemini-2.5-flash \
  npm run loom -- repl
```

---

## 4. Mistral AI Provider

Native adapter for Mistral AI models (`mistral-large-latest`, `codestral-latest`).

```bash
# POSIX
LOOM_PROVIDER=mistral MISTRAL_API_KEY=... LOOM_MODEL=mistral-large-latest \
  npm run loom -- repl
```

---

## 5. OpenAI & OpenAI-Compatible Providers

Supports OpenAI directly as well as any OpenAI-compatible server (Ollama, OpenRouter, DeepSeek, Groq, vLLM, LiteLLM).

```bash
# OpenAI
LOOM_PROVIDER=openai OPENAI_API_KEY=sk-... LOOM_MODEL=gpt-4o-mini \
  npm run loom -- run "inspect this repository"

# Ollama (Local)
LOOM_PROVIDER=openai OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama LOOM_MODEL=qwen2.5-coder:7b \
  npm run loom -- repl

# OpenRouter
LOOM_PROVIDER=openai OPENAI_BASE_URL=https://openrouter.ai/api/v1 OPENAI_API_KEY=sk-or-... LOOM_MODEL=anthropic/claude-3.7-sonnet \
  npm run loom -- repl
```
