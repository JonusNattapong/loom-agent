import type { Message, Provider, ProviderRequest, ProviderResponse, ToolCall } from "@loom-agent/core";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.LOOM_MODEL ?? "claude-3-7-sonnet-20250219", baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1") {
    this.apiKey = apiKey ?? "";
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async complete(messages: Message[]): Promise<ProviderResponse> {
    return this.generate({ messages, model: this.model });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const key = this.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY is required for the anthropic provider. Run /apikey anthropic to set it.");
    }
    const formattedMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of request.messages) {
      formattedMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      max_tokens: 4096,
      messages: formattedMessages,
    };

    if (request.system) {
      body.system = request.system;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema ?? { type: "object", properties: {} },
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Anthropic request failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      id?: string;
      model?: string;
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const item of data.content ?? []) {
      if (item.type === "text" && item.text) {
        textParts.push(item.text);
      } else if (item.type === "tool_use" && item.name) {
        toolCalls.push({
          id: item.id ?? `call_${toolCalls.length}`,
          name: item.name,
          input: item.input ?? {},
        });
      }
    }

    return {
      content: textParts.join("\n"),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            prompt_tokens: data.usage.input_tokens ?? 0,
            completion_tokens: data.usage.output_tokens ?? 0,
            total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined,
      finishReason: data.stop_reason,
      requestId: data.id,
      metadata: { model: data.model },
    };
  }
}
