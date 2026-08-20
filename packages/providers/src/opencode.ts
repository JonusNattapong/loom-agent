import { createOpencode, createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import type { Message, Provider, ProviderRequest, ProviderResponse } from "@loom-agent/core";

export interface OpenCodeProviderOptions {
  /** Connect to an already running OpenCode server instead of starting one. */
  baseUrl?: string;
  /** Workspace sent to the OpenCode API. */
  cwd?: string;
  /** OpenCode server startup timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional OpenCode model in `provider/model` form. */
  model?: string;
}

type OpenCodeHost = { client: OpencodeClient; server?: { close(): void } };

/** Uses OpenCode's official TypeScript SDK and HTTP API. */
export class OpenCodeProvider implements Provider {
  readonly name = "opencode";
  private readonly cwd: string;
  private readonly timeoutMs: number;
  private readonly baseUrl?: string;
  private readonly defaultModel?: string;
  private host?: Promise<OpenCodeHost>;
  private sessionId?: string;

  constructor(options: OpenCodeProviderOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.baseUrl = options.baseUrl ?? process.env.OPENCODE_BASE_URL;
    this.defaultModel = options.model ?? process.env.OPENCODE_MODEL;
  }

  async complete(messages: Message[]): Promise<ProviderResponse> {
    return this.generate({ messages });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const host = await this.getHost();
    const session = await this.getSession(host.client);
    const prompt = formatOpenCodePrompt(request);
    const model = request.model ?? this.defaultModel;
    const result = await host.client.session.prompt({
      path: { id: session },
      query: { directory: this.cwd },
      body: {
        ...(request.system ? { system: request.system } : {}),
        ...(model ? { model: parseModel(model) } : {}),
        parts: [{ type: "text", text: prompt }],
      },
    }) as any;
    if (result?.error) throw new Error(`OpenCode API error: ${formatError(result.error)}`);
    const payload = result?.data ?? result;
    const content = Array.isArray(payload?.parts)
      ? payload.parts.filter((part: any) => part.type === "text" && !part.ignored).map((part: any) => part.text).join("\n")
      : "";
    if (!content.trim()) throw new Error("OpenCode returned an empty response");
    const info = payload?.info;
    return {
      content: content.trim(),
      finishReason: info?.finish ?? "stop",
      usage: info?.tokens ? { input_tokens: info.tokens.input, output_tokens: info.tokens.output } : undefined,
      requestId: info?.id,
      metadata: { provider: this.name, sessionId: session, model: info?.modelID ?? model, cwd: this.cwd },
    };
  }

  /** Stop an SDK-managed OpenCode server. No-op for externally managed servers. */
  dispose(): void {
    void this.host?.then((host) => host.server?.close());
    this.host = undefined;
    this.sessionId = undefined;
  }

  private async getHost(): Promise<OpenCodeHost> {
    if (!this.host) {
      this.host = this.baseUrl
        ? Promise.resolve({ client: createOpencodeClient({ baseUrl: this.baseUrl, directory: this.cwd }) })
        : createOpencode({ port: 0, timeout: this.timeoutMs }).then(({ client, server }) => ({ client, server }));
    }
    return this.host;
  }

  private async getSession(client: OpencodeClient): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const result = await client.session.create({ query: { directory: this.cwd }, body: { title: "Loom" } }) as any;
    if (result?.error) throw new Error(`OpenCode session error: ${formatError(result.error)}`);
    const session = result?.data ?? result;
    if (!session?.id) throw new Error("OpenCode did not return a session id");
    this.sessionId = session.id;
    return session.id;
  }
}

export function parseModel(model: string): { providerID: string; modelID: string } {
  const separator = model.indexOf("/");
  return separator > 0
    ? { providerID: model.slice(0, separator), modelID: model.slice(separator + 1) }
    : { providerID: "opencode", modelID: model };
}

export function formatOpenCodePrompt(request: ProviderRequest): string {
  const sections: string[] = [];
  if (request.system) sections.push(`SYSTEM:\n${request.system}`);
  sections.push(...request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`));
  if (request.tools?.length) sections.push(`LOOM TOOLS AVAILABLE:\n${request.tools.map((tool) => `- ${tool.name}: ${tool.description ?? ""}`).join("\n")}`);
  return sections.join("\n\n");
}

function formatError(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
}
