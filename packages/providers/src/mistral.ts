import type { Message, Provider, ProviderRequest, ProviderResponse, ToolCall } from "@loom-agent/core";

export interface MistralProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class MistralProvider implements Provider {
  readonly name = "mistral";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    apiKey = process.env.MISTRAL_API_KEY,
    model = process.env.LOOM_MODEL ?? "mistral-large-latest",
    baseUrl = process.env.MISTRAL_BASE_URL ?? "https://api.mistral.ai/v1"
  ) {
    this.apiKey = apiKey ?? "";
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async complete(messages: Message[]): Promise<ProviderResponse> {
    return this.generate({ messages, model: this.model });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const key = this.apiKey || process.env.MISTRAL_API_KEY;
    if (!key) {
      throw new Error("MISTRAL_API_KEY is required for the mistral provider. Run /apikey mistral to set it.");
    }
    const targetModel = request.model ?? this.model;
    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (request.system) {
      formattedMessages.push({ role: "system", content: request.system });
    }

    for (const msg of request.messages) {
      formattedMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const body: Record<string, unknown> = {
      model: targetModel,
      messages: formattedMessages,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema ?? { type: "object" },
        },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Mistral request failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = [];

    for (const call of choice?.tool_calls ?? []) {
      toolCalls.push({
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || "{}"),
      });
    }

    return {
      content: choice?.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage,
      finishReason: data.choices?.[0]?.finish_reason,
      requestId: data.id,
      metadata: { model: data.model ?? targetModel },
    };
  }
}
