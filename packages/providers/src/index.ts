import type { Message, Provider, ProviderRequest, ProviderResponse } from "@loom-agent/core";
import { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic.js";
import { GoogleProvider, type GoogleProviderOptions } from "./google.js";
import { MistralProvider, type MistralProviderOptions } from "./mistral.js";

export { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic.js";
export { GoogleProvider, type GoogleProviderOptions } from "./google.js";
export { MistralProvider, type MistralProviderOptions } from "./mistral.js";
export {
  fetchModelsForProvider,
  fetchAllConfiguredModels,
  type RemoteModelInfo,
} from "./models.js";

/** Deterministic provider used by tests and offline local development. */
export class MockProvider implements Provider {
  readonly name = "mock";
  async complete(messages: Message[]): Promise<ProviderResponse> {
    const task = messages.find((message) => message.role === "user")?.content ?? "";
    return { content: `Completed task: ${task}` };
  }
}

export class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.LOOM_MODEL ?? "gpt-4o",
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    providerName = "openai"
  ) {
    this.name = providerName;
  }

  async complete(messages: Message[]) {
    return this.generate({ messages, model: this.model });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const key = this.apiKey || (this.name === "openai" ? process.env.OPENAI_API_KEY : this.name === "deepseek" ? process.env.DEEPSEEK_API_KEY : this.name === "groq" ? process.env.GROQ_API_KEY : this.name === "openrouter" ? process.env.OPENROUTER_API_KEY : undefined);
    if (!key && this.name !== "ollama") {
      throw new Error(`${this.name.toUpperCase()}_API_KEY is required for provider ${this.name}. Run /apikey ${this.name} to set it.`);
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (key) {
      headers["authorization"] = `Bearer ${key}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model ?? this.model,
        messages: [...(request.system ? [{ role: "system", content: request.system }] : []), ...request.messages],
        tools: request.tools?.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema ?? { type: "object" } },
        })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Provider (${this.name}) request failed with status ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as any;
    const message = data.choices?.[0]?.message ?? {};
    return {
      content: message.content ?? "",
      toolCalls: (message.tool_calls ?? []).map((c: any) => ({
        id: c.id,
        name: c.function.name,
        input: typeof c.function.arguments === "string" ? JSON.parse(c.function.arguments || "{}") : c.function.arguments,
      })),
      usage: data.usage,
      finishReason: data.choices?.[0]?.finish_reason,
      requestId: data.id,
      metadata: { model: data.model },
    };
  }
}

export type ProviderConfig =
  | { id?: string; apiKey?: string; model?: string; baseUrl?: string }
  | string;

export function createProvider(config?: ProviderConfig): Provider {
  let providerId = typeof config === "string" ? config : config?.id ?? process.env.LOOM_PROVIDER;

  if (!providerId) {
    if (process.env.ANTHROPIC_API_KEY) providerId = "anthropic";
    else if (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) providerId = "google";
    else if (process.env.OPENAI_API_KEY) providerId = "openai";
    else if (process.env.MISTRAL_API_KEY) providerId = "mistral";
    else if (process.env.DEEPSEEK_API_KEY) providerId = "deepseek";
    else if (process.env.GROQ_API_KEY) providerId = "groq";
    else if (process.env.OPENROUTER_API_KEY) providerId = "openrouter";
    else providerId = "anthropic";
  }

  const model = typeof config === "object" ? config.model : process.env.LOOM_MODEL;

  switch (providerId.toLowerCase()) {
    case "mock":
      return new MockProvider();
    case "openai": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.OPENAI_API_KEY;
      const baseUrl = typeof config === "object" && "baseUrl" in config ? config.baseUrl : process.env.OPENAI_BASE_URL;
      return new OpenAICompatibleProvider(apiKey, model ?? "gpt-4o", baseUrl, "openai");
    }
    case "anthropic":
    case "claude": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.ANTHROPIC_API_KEY;
      const baseUrl = typeof config === "object" && "baseUrl" in config ? config.baseUrl : process.env.ANTHROPIC_BASE_URL;
      return new AnthropicProvider(apiKey, model ?? "claude-3-7-sonnet-20250219", baseUrl);
    }
    case "google":
    case "gemini": {
      const apiKey =
        typeof config === "object" && "apiKey" in config
          ? config.apiKey
          : process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      const baseUrl = typeof config === "object" && "baseUrl" in config ? config.baseUrl : process.env.GEMINI_BASE_URL;
      return new GoogleProvider(apiKey, model ?? "gemini-2.5-flash", baseUrl);
    }
    case "mistral": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.MISTRAL_API_KEY;
      const baseUrl = typeof config === "object" && "baseUrl" in config ? config.baseUrl : process.env.MISTRAL_BASE_URL;
      return new MistralProvider(apiKey, model ?? "mistral-large-latest", baseUrl);
    }
    case "deepseek": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.DEEPSEEK_API_KEY;
      return new OpenAICompatibleProvider(apiKey, model ?? "deepseek-chat", "https://api.deepseek.com", "deepseek");
    }
    case "groq": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.GROQ_API_KEY;
      return new OpenAICompatibleProvider(apiKey, model ?? "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1", "groq");
    }
    case "openrouter": {
      const apiKey = typeof config === "object" && "apiKey" in config ? config.apiKey : process.env.OPENROUTER_API_KEY;
      return new OpenAICompatibleProvider(apiKey, model ?? "anthropic/claude-3.7-sonnet", "https://openrouter.ai/api/v1", "openrouter");
    }
    case "ollama": {
      const baseUrl = typeof config === "object" && "baseUrl" in config ? config.baseUrl : "http://localhost:11434/v1";
      return new OpenAICompatibleProvider("ollama", model ?? "qwen2.5-coder:7b", baseUrl, "ollama");
    }
    default:
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model ?? "claude-3-7-sonnet-20250219");
  }
}
