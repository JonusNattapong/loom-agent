import { describe, expect, it } from "vitest";
import { routeFor, routeHref } from "./routing";

describe("routing", () => {
  it("matches collection and encoded detail routes", () => {
    expect(routeFor("/agents")).toEqual({ page: "agents" });
    expect(routeFor("/routes")).toEqual({ page: "routes" });
    expect(routeFor("/agents/agent%201")).toEqual({ page: "agent", id: "agent 1" });
  });
  it("normalizes the root and rejects extra segments", () => {
    expect(routeFor("/")).toEqual({ page: "dashboard" });
    expect(routeFor("/jobs/extra")).toEqual({ page: "not-found" });
  });
  it("escapes IDs when creating links", () => {
    expect(routeHref("workers", "a/b")).toBe("/workers/a%2Fb");
  });
});
