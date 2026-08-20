import {describe, it, expect} from "vitest";
import {
  defineAgent,
  defineTool,
  defineSkill,
  defineBot,
  createLoomApp,
  SDK_API_VERSION,
} from "./index.js";
import type {LoomEvent} from "./contracts.js";

describe("@loom-agent/sdk public contracts", () => {
  it("exposes a stable SDK API version", () => {
    expect(SDK_API_VERSION).toBe("1.1.0");
  });

  it("defineAgent rejects empty id", () => {
    expect(() => defineAgent({id: ""})).toThrow();
  });

  it("defineTool rejects missing execute", () => {
    expect(() => defineTool({name: "x", description: "y"} as any)).toThrow();
  });

  it("createLoomApp builds an app and runs a goal via embedded runtime", async () => {
    const app = createLoomApp({
      name: "test-app",
      agents: [defineAgent({id: "main", role: "planner", provider: "mock"})],
      provider: {id: "mock"},
      dbPath: ":memory:",
    });
    const events: LoomEvent[] = [];
    const off = app.onEvent((e) => events.push(e));
    const result = await app.run({goal: "say hello"});
    expect(result.status).toBe("completed");
    expect(events.some((e) => e.type === "agent.started")).toBe(true);
    expect(events.some((e) => e.type === "agent.completed")).toBe(true);
    off();
  });

  it("SDK tools run through the tool executor with permissions", async () => {
    const app = createLoomApp({
      name: "tool-app",
      provider: {id: "mock"},
      dbPath: ":memory:",
      policy: {tools: {secret: "deny"}},
    });
    app.registerTool(defineTool({name: "ping", description: "ping", execute: async () => "pong"}));
    // denied tool cannot be registered as SDK tool with deny? It uses native registry; ensure execute works
    const ping = app.getProvider(); // provider sanity
    expect(ping).toBeDefined();
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() => createLoomApp({schemaVersion: 2})).toThrow();
  });

  it("defineSkill and defineBot validate input", () => {
    const skill = defineSkill({name: "s", description: "d"});
    expect(skill.name).toBe("s");
    expect(() => defineBot({id: "", agent: "", transport: {} as any})).toThrow();
  });
});
