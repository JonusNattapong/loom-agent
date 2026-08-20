import {describe, it, expect} from "vitest";
import {validateConfig, assertValid, isValid, CURRENT_SCHEMA_VERSION} from "./index.js";

describe("@loom/config validation", () => {
  it("accepts a minimal valid config", () => {
    const issues = validateConfig({schemaVersion: 1, name: "x", provider: {id: "mock"}});
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("reports missing schemaVersion with helpful message", () => {
    const issues = validateConfig({});
    expect(issues.some((i) => i.path === "schemaVersion" && /required/.test(i.message))).toBe(true);
  });

  it("reports unsupported schemaVersion", () => {
    const issues = validateConfig({schemaVersion: 99});
    expect(issues.some((i) => i.path === "schemaVersion" && /unsupported/.test(i.message))).toBe(true);
  });

  it("reports unknown agent role with path", () => {
    const issues = validateConfig({schemaVersion: 1, agents: [{id: "a", role: "wizard"}]});
    expect(issues.some((i) => i.path === "agents[0].role" && /unknown role/.test(i.message))).toBe(true);
  });

  it("reports unknown tool permission with path", () => {
    const issues = validateConfig({schemaVersion: 1, tools: [{name: "t", permissions: "maybe"}]});
    expect(issues.some((i) => i.path === "tools[0].permissions")).toBe(true);
  });

  it("reports duplicate agent ids", () => {
    const issues = validateConfig({schemaVersion: 1, agents: [{id: "a"}, {id: "a"}]});
    expect(issues.some((i) => /duplicate agent id/.test(i.message))).toBe(true);
  });

  it("assertValid throws aggregated helpful errors", () => {
    expect(() => assertValid({schemaVersion: 1, agents: [{id: "a", role: "x"}]})).toThrow(/agents\[0\]\.role/);
  });

  it("isValid narrows type on success", () => {
    expect(isValid({schemaVersion: 1})).toBe(true);
    expect(isValid({})).toBe(false);
  });

  it("exposes current schema version", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
