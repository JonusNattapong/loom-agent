export interface RemoteModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
}

export async function fetchModelsForProvider(
  providerId: string,
  options?: { apiKey?: string; baseUrl?: string }
): Promise<RemoteModelInfo[]> {
  const pId = providerId.toLowerCase();

  try {
    switch (pId) {
      case "anthropic":
      case "claude": {
        const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return getDefaultAnthropicModels();
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) return getDefaultAnthropicModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map((m: any) => ({
            id: m.id,
            name: m.display_name ?? m.id,
            provider: "anthropic",
          }));
        }
        return getDefaultAnthropicModels();
      }

      case "google":
      case "gemini": {
        const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
        if (!apiKey) return getDefaultGoogleModels();
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) return getDefaultGoogleModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.models) && json.models.length > 0) {
          return json.models
            .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
            .map((m: any) => {
              const cleanId = m.name.replace(/^models\//, "");
              return {
                id: cleanId,
                name: m.displayName ?? cleanId,
                provider: "google",
                description: m.description,
              };
            });
        }
        return getDefaultGoogleModels();
      }

      case "openai": {
        const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
        const baseUrl = options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
        if (!apiKey) return getDefaultOpenAIModels();
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return getDefaultOpenAIModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data
            .filter((m: any) => m.id.startsWith("gpt") || m.id.startsWith("o1") || m.id.startsWith("o3") || m.id.startsWith("chatgpt"))
            .map((m: any) => ({
              id: m.id,
              name: m.id,
              provider: "openai",
            }));
        }
        return getDefaultOpenAIModels();
      }

      case "mistral": {
        const apiKey = options?.apiKey ?? process.env.MISTRAL_API_KEY;
        if (!apiKey) return getDefaultMistralModels();
        const res = await fetch("https://api.mistral.ai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return getDefaultMistralModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map((m: any) => ({
            id: m.id,
            name: m.id,
            provider: "mistral",
          }));
        }
        return getDefaultMistralModels();
      }

      case "ollama": {
        const baseUrl = options?.baseUrl ?? "http://localhost:11434";
        const res = await fetch(`${baseUrl}/api/tags`);
        if (!res.ok) return getDefaultOllamaModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.models) && json.models.length > 0) {
          return json.models.map((m: any) => ({
            id: m.name,
            name: m.name,
            provider: "ollama",
          }));
        }
        return getDefaultOllamaModels();
      }

      case "openrouter": {
        const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY;
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        if (!res.ok) return [];
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.slice(0, 50).map((m: any) => ({
            id: m.id,
            name: m.name ?? m.id,
            provider: "openrouter",
          }));
        }
        return [];
      }

      case "groq": {
        const apiKey = options?.apiKey ?? process.env.GROQ_API_KEY;
        if (!apiKey) return [];
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return [];
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map((m: any) => ({
            id: m.id,
            name: m.id,
            provider: "groq",
          }));
        }
        return [];
      }

      case "deepseek": {
        const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY;
        if (!apiKey) return getDefaultDeepSeekModels();
        const res = await fetch("https://api.deepseek.com/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return getDefaultDeepSeekModels();
        const json = (await res.json()) as any;
        if (Array.isArray(json.data) && json.data.length > 0) {
          return json.data.map((m: any) => ({
            id: m.id,
            name: m.id,
            provider: "deepseek",
          }));
        }
        return getDefaultDeepSeekModels();
      }

      default:
        return [];
    }
  } catch {
    // Fallback to static lists
    return getFallbackModelsFor(pId);
  }
}

export async function fetchAllConfiguredModels(): Promise<RemoteModelInfo[]> {
  const providers = ["anthropic", "google", "openai", "mistral", "deepseek", "ollama"];
  const results: RemoteModelInfo[] = [];

  for (const p of providers) {
    const list = await fetchModelsForProvider(p);
    results.push(...list);
  }

  return results;
}

function getFallbackModelsFor(provider: string): RemoteModelInfo[] {
  switch (provider) {
    case "anthropic":
    case "claude":
      return getDefaultAnthropicModels();
    case "google":
    case "gemini":
      return getDefaultGoogleModels();
    case "openai":
      return getDefaultOpenAIModels();
    case "mistral":
      return getDefaultMistralModels();
    case "deepseek":
      return getDefaultDeepSeekModels();
    case "ollama":
      return getDefaultOllamaModels();
    default:
      return [];
  }
}

function getDefaultAnthropicModels(): RemoteModelInfo[] {
  return [
    { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet", provider: "anthropic" },
    { id: "claude-3-5-sonnet-20241022", name: "claude-3-5-sonnet", provider: "anthropic" },
    { id: "claude-3-5-haiku-20241022", name: "claude-3-5-haiku", provider: "anthropic" },
    { id: "claude-3-opus-20240229", name: "claude-3-opus", provider: "anthropic" },
  ];
}

function getDefaultGoogleModels(): RemoteModelInfo[] {
  return [
    { id: "gemini-2.5-flash", name: "gemini-2.5-flash", provider: "google" },
    { id: "gemini-2.5-pro", name: "gemini-2.5-pro", provider: "google" },
    { id: "gemini-2.0-flash", name: "gemini-2.0-flash", provider: "google" },
  ];
}

function getDefaultOpenAIModels(): RemoteModelInfo[] {
  return [
    { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
    { id: "gpt-4o-mini", name: "gpt-4o-mini", provider: "openai" },
    { id: "o3-mini", name: "o3-mini", provider: "openai" },
    { id: "o1", name: "o1", provider: "openai" },
    { id: "o1-mini", name: "o1-mini", provider: "openai" },
  ];
}

function getDefaultMistralModels(): RemoteModelInfo[] {
  return [
    { id: "mistral-large-latest", name: "mistral-large-latest", provider: "mistral" },
    { id: "codestral-latest", name: "codestral-latest", provider: "mistral" },
    { id: "mistral-small-latest", name: "mistral-small-latest", provider: "mistral" },
  ];
}

function getDefaultDeepSeekModels(): RemoteModelInfo[] {
  return [
    { id: "deepseek-chat", name: "deepseek-chat (V3)", provider: "deepseek" },
    { id: "deepseek-reasoner", name: "deepseek-reasoner (R1)", provider: "deepseek" },
  ];
}

function getDefaultOllamaModels(): RemoteModelInfo[] {
  return [
    { id: "qwen2.5-coder:7b", name: "qwen2.5-coder:7b", provider: "ollama" },
    { id: "llama3.3:70b", name: "llama3.3:70b", provider: "ollama" },
    { id: "deepseek-r1:14b", name: "deepseek-r1:14b", provider: "ollama" },
  ];
}
