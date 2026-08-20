import { describe, it, expect, vi } from "vitest";
import {
  OpenAICompatibleProvider,
  AnthropicProvider,
  GoogleProvider,
  MistralProvider,
  createProvider,
  fetchModelsForProvider,
  OpenCodeProvider,
  formatOpenCodePrompt,
} from "./index.js";

describe("@loom-agent/providers", () => {
  describe("createProvider factory", () => {
    it("creates AnthropicProvider with key", () => {
      const provider = createProvider({ id: "anthropic", apiKey: "test-key" });
      expect(provider.name).toBe("anthropic");
    });

    it("creates GoogleProvider with key", () => {
      const provider = createProvider({ id: "gemini", apiKey: "test-key" });
      expect(provider.name).toBe("google");
    });

    it("creates MistralProvider with key", () => {
      const provider = createProvider({ id: "mistral", apiKey: "test-key" });
      expect(provider.name).toBe("mistral");
    });

    it("creates OpenAICompatibleProvider with key", () => {
      const provider = createProvider({ id: "openai", apiKey: "test-key" });
      expect(provider.name).toBe("openai");
    });

    it("creates DeepSeek provider", () => {
      const provider = createProvider({ id: "deepseek", apiKey: "test-key" });
      expect(provider.name).toBe("deepseek");
    });

    it("creates an OpenCode provider", () => {
      const provider = createProvider({ id: "opencode" });
      expect(provider).toBeInstanceOf(OpenCodeProvider);
      expect(provider.name).toBe("opencode");
    });
  });

  it("formats system, messages, and tools for OpenCode", () => {
    const prompt = formatOpenCodePrompt({
      system: "Be concise",
      messages: [{ role: "user", content: "Inspect the repo" }],
      tools: [{ name: "read_file", description: "Read a file" }],
    });
    expect(prompt).toContain("SYSTEM:");
    expect(prompt).toContain("USER:");
    expect(prompt).toContain("read_file");
  });

  describe("Dynamic model fetching", () => {
    it("fetches models for Anthropic provider", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "claude-3-7-sonnet-20250219", display_name: "Claude 3.7 Sonnet" },
            { id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const models = await fetchModelsForProvider("anthropic", { apiKey: "sk-ant-test" });
      expect(models.length).toBe(2);
      expect(models[0]?.id).toBe("claude-3-7-sonnet-20250219");
      expect(models[0]?.name).toBe("Claude 3.7 Sonnet");
    });

    it("fetches models for Google provider", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const models = await fetchModelsForProvider("google", { apiKey: "AIzaSy-test" });
      expect(models.length).toBe(1);
      expect(models[0]?.id).toBe("gemini-2.5-flash");
      expect(models[0]?.name).toBe("Gemini 2.5 Flash");
    });
  });

  describe("AnthropicProvider payload structure", () => {
    it("formats request properly and parses tool calls", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg_123",
          model: "claude-3-7-sonnet-20250219",
          content: [
            { type: "text", text: "I will read the file." },
            {
              type: "tool_use",
              id: "tool_1",
              name: "read_file",
              input: { path: "README.md" },
            },
          ],
          usage: { input_tokens: 15, output_tokens: 25 },
          stop_reason: "tool_use",
        }),
      });
      globalThis.fetch = mockFetch;

      const provider = new AnthropicProvider("sk-ant-test", "claude-3-7-sonnet-20250219");
      const res = await provider.generate({
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Check readme" }],
        tools: [{ name: "read_file", description: "Read a file" }],
      });

      expect(res.content).toBe("I will read the file.");
      expect(res.toolCalls?.length).toBe(1);
      expect(res.toolCalls?.[0]?.name).toBe("read_file");
      expect(res.toolCalls?.[0]?.input).toEqual({ path: "README.md" });
      expect(res.usage?.total_tokens).toBe(40);
    });
  });
});
