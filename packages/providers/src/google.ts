import type { Message, Provider, ProviderRequest, ProviderResponse, ToolCall } from "@loom-agent/core";

export interface GoogleProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class GoogleProvider implements Provider {
  readonly name = "google";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    model = process.env.LOOM_MODEL ?? "gemini-2.5-flash",
    baseUrl = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
  ) {
    this.apiKey = apiKey ?? "";
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async complete(messages: Message[]): Promise<ProviderResponse> {
    return this.generate({ messages, model: this.model });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const key = this.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is required for the google provider. Run /apikey google to set it.");
    }
    const targetModel = request.model ?? this.model;
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> }> = [];

    for (const msg of request.messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    const body: Record<string, unknown> = {
      contents,
    };

    if (request.system) {
      body.systemInstruction = {
        parts: [{ text: request.system }],
      };
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema ?? { type: "OBJECT" },
          })),
        },
      ];
    }

    const url = `${this.baseUrl}/models/${targetModel}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Google Gemini request failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      modelVersion?: string;
    };

    const firstCandidate = data.candidates?.[0];
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of firstCandidate?.content?.parts ?? []) {
      if (part.text) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${toolCalls.length}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      }
    }

    return {
      content: textParts.join("\n"),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usageMetadata
        ? {
            prompt_tokens: data.usageMetadata.promptTokenCount ?? 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount ?? 0,
            total_tokens: data.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: firstCandidate?.finishReason,
      metadata: { model: data.modelVersion ?? targetModel },
    };
  }
}
