import { spawn } from "node:child_process";
import type { Message, Provider, ProviderRequest, ProviderResponse } from "@loom-agent/core";

export interface OpenCodeProviderOptions {
  /** Executable name or absolute path. Defaults to `opencode`. */
  command?: string;
  /** Directory OpenCode should operate in. Defaults to the current directory. */
  cwd?: string;
  /** Maximum time to wait for a run, in milliseconds. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** Runs the installed OpenCode coding agent as a Loom provider. */
export class OpenCodeProvider implements Provider {
  readonly name = "opencode";
  private readonly command: string;
  private readonly cwd: string;
  private readonly timeoutMs: number;
  private readonly env?: NodeJS.ProcessEnv;

  constructor(options: OpenCodeProviderOptions = {}) {
    this.command = options.command ?? process.env.OPENCODE_COMMAND ?? "opencode";
    this.cwd = options.cwd ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.env = options.env;
  }

  async complete(messages: Message[]): Promise<ProviderResponse> {
    return this.generate({ messages });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const prompt = formatOpenCodePrompt(request);
    const startedAt = Date.now();
    const output = await this.run(prompt);
    return {
      content: output.trim(),
      finishReason: "stop",
      metadata: {
        provider: this.name,
        command: this.command,
        durationMs: Date.now() - startedAt,
        model: request.model,
      },
    };
  }

  private run(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, ["run", prompt], {
        cwd: this.cwd,
        env: { ...process.env, ...this.env },
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`OpenCode timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.once("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error.code === "ENOENT") {
          reject(new Error("OpenCode is not installed or not on PATH. Install it, then retry."));
        } else {
          reject(error);
        }
      });
      child.once("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          const detail = stderr.trim() || `exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
          reject(new Error(`OpenCode failed: ${detail}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
}

export function formatOpenCodePrompt(request: ProviderRequest): string {
  const sections: string[] = [];
  if (request.system) sections.push(`SYSTEM:\n${request.system}`);
  sections.push(...request.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`));
  if (request.tools?.length) {
    sections.push(`AVAILABLE LOOM TOOLS (OpenCode may perform equivalent actions directly):\n${request.tools.map((tool) => `- ${tool.name}: ${tool.description ?? ""}`).join("\n")}`);
  }
  return sections.join("\n\n");
}
