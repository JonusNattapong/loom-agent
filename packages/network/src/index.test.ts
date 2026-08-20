import {describe, expect, it} from "vitest";
import {
  LoomAddressError,
  LoomRouteRegistry,
  LoomRouteValidationError,
  formatLoomAddress,
  isLoomAddress,
  parseLoomAddress,
  sameLoomAddress,
  type LoomRouteResolver,
} from "./index.js";

describe("loom address", () => {
  it.each([
    ["loom://worker/gpu-01", "worker", "gpu-01"],
    ["loom://agent/root-123", "agent", "root-123"],
    ["loom://job/job-456", "job", "job-456"],
    ["loom://bot/oracle", "bot", "oracle"],
    ["loom://schedule/nightly", "schedule", "nightly"],
    ["loom://controller/main", "controller", "main"],
  ] as const)("parses canonical address %s", (text, kind, id) => {
    const parsed = parseLoomAddress(text);
    expect(parsed).toEqual({scheme: "loom", kind, id});
    expect(formatLoomAddress(parsed)).toBe(text);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("never permits an ID to become multiple path segments", () => {
    expect(() => formatLoomAddress({kind: "bot", id: "oracle/alpha"})).toThrowError(LoomAddressError);
    expect(() => formatLoomAddress({kind: "bot", id: "oracle\\alpha"})).toThrowError(LoomAddressError);
  });

  it("round-trips canonical percent-safe IDs", () => {
    const text = formatLoomAddress({kind: "bot", id: "oracle alpha ไทย"});
    expect(text).toBe("loom://bot/oracle%20alpha%20%E0%B9%84%E0%B8%97%E0%B8%A2");
    expect(parseLoomAddress(text).id).toBe("oracle alpha ไทย");
    expect(sameLoomAddress(text, {scheme: "loom", kind: "bot", id: "oracle alpha ไทย"})).toBe(true);
  });

  it.each([
    "http://worker/gpu-01",
    "LOOM://worker/gpu-01",
    "loom:/worker/gpu-01",
    "loom://worker",
    "loom:///gpu-01",
    "loom://workers/gpu-01",
    "loom://Worker/gpu-01",
    "loom://user@worker/gpu-01",
    "loom://worker:443/gpu-01",
    "loom://worker/",
    "loom://worker/gpu/01",
    "loom://worker/gpu-01/",
    "loom://worker/.",
    "loom://worker/..",
    "loom://worker/gpu\\01",
    "loom://worker/gpu%2F01",
    "loom://worker/gpu%5C01",
    "loom://worker/%67pu-01",
    "loom://worker/a%2fb",
    "loom://worker/%",
    "loom://worker/%E0%A4%A",
    "loom://worker/gpu-01?epoch=2",
    "loom://worker/gpu-01#connection",
  ])("rejects invalid or non-canonical address %s", text => {
    expect(() => parseLoomAddress(text)).toThrowError(LoomAddressError);
    expect(isLoomAddress(text)).toBe(false);
  });

  it("rejects credentials, ports, query, and fragment with focused errors", () => {
    expect(() => parseLoomAddress("loom://user@worker/id")).toThrowError(expect.objectContaining({code: "credentials_not_allowed"}));
    expect(() => parseLoomAddress("loom://worker:99/id")).toThrowError(expect.objectContaining({code: "port_not_allowed"}));
    expect(() => parseLoomAddress("loom://worker/id?q=1")).toThrowError(expect.objectContaining({code: "query_not_allowed"}));
    expect(() => parseLoomAddress("loom://worker/id#x")).toThrowError(expect.objectContaining({code: "fragment_not_allowed"}));
  });

  it("does not mistake arbitrary values for addresses", () => {
    expect(isLoomAddress(null)).toBe(false);
    expect(isLoomAddress({kind: "worker", id: "x"})).toBe(false);
    expect(isLoomAddress("loom://worker/x")).toBe(true);
  });
});

describe("logical topology and route resolution", () => {
  const target = "loom://worker/gpu-01";

  it("keeps a logical node when its current route disappears", () => {
    const registry = new LoomRouteRegistry();
    const node = registry.registerNode(target, {capability: "gpu"});
    const route = registry.replaceConnection(target, "conn-1");
    expect(node.identity).toBe(target);
    expect(registry.resolve(target)).toBe(route);
    expect(registry.isCurrent(route)).toBe(true);

    expect(registry.invalidateConnection("conn-1")).toEqual([parseLoomAddress(target)]);
    expect(registry.resolve(target)).toBeUndefined();
    expect(registry.getNode(target)).toEqual(node);
    expect(registry.hasNode(target)).toBe(true);
    expect(registry.isCurrent(route)).toBe(false);
  });

  it("atomically replaces a current connection and ignores a delayed old disconnect", () => {
    const registry = new LoomRouteRegistry();
    const oldRoute = registry.replaceConnection(target, "conn-old");
    const replacement = registry.replaceConnection(target, "conn-new", {state: "degraded", cost: 2});

    expect(replacement.revision).toBeGreaterThan(oldRoute.revision!);
    expect(registry.resolve(target)).toBe(replacement);
    expect(registry.isCurrent(oldRoute)).toBe(false);
    expect(registry.isCurrent(replacement)).toBe(true);
    expect(registry.invalidateRoute(target, {connectionId: "conn-old"})).toBe(false);
    expect(registry.invalidateConnection("conn-old")).toEqual([]);
    expect(registry.resolve(target)).toBe(replacement);
    expect(registry.invalidateRoute(target, {revision: replacement.revision})).toBe(true);
    expect(registry.hasNode(target)).toBe(true);
  });

  it("supports controller websocket, relay, and future direct route descriptions", () => {
    const registry = new LoomRouteRegistry();
    const websocket = registry.setRoute({target, transport: "controller-websocket", connectionId: "c1", state: "available"});
    const relay = registry.setRoute({target, transport: "relay", relayId: "relay-a", cost: 5, state: "degraded"});
    const direct = registry.setRoute({target, transport: "direct", state: "unavailable"});
    expect(websocket.transport).toBe("controller-websocket");
    expect(relay).toMatchObject({transport: "relay", relayId: "relay-a", cost: 5, state: "degraded"});
    expect(direct).toMatchObject({transport: "direct", state: "unavailable"});
    expect(Object.isFrozen(direct)).toBe(true);
  });

  it("creates an immutable resolver snapshot", () => {
    const registry = new LoomRouteRegistry();
    const first = registry.replaceConnection(target, "conn-1");
    const snapshot: LoomRouteResolver = registry.snapshot();
    registry.replaceConnection(target, "conn-2");
    registry.registerNode("loom://agent/root-123");

    expect(snapshot.resolve(target)).toBe(first);
    expect(registry.resolve(target)?.connectionId).toBe("conn-2");
    expect((snapshot as any).getNode("loom://agent/root-123")).toBeUndefined();
  });

  it("isolates identities by canonical kind and ID", () => {
    const registry = new LoomRouteRegistry();
    registry.replaceConnection("loom://worker/shared", "worker-connection");
    registry.replaceConnection("loom://agent/shared", "agent-connection");
    expect(registry.resolve("loom://worker/shared")?.connectionId).toBe("worker-connection");
    expect(registry.resolve("loom://agent/shared")?.connectionId).toBe("agent-connection");
    expect(registry.listNodes()).toHaveLength(2);
  });

  it("validates route state, transport, identifiers, and cost", () => {
    const registry = new LoomRouteRegistry();
    expect(() => registry.setRoute({target, transport: "mesh" as any, state: "available"})).toThrowError(LoomRouteValidationError);
    expect(() => registry.setRoute({target, transport: "relay", state: "lost" as any})).toThrowError(LoomRouteValidationError);
    expect(() => registry.replaceConnection(target, " ")).toThrowError(LoomRouteValidationError);
    expect(() => registry.setRoute({target, transport: "direct", state: "available", cost: -1})).toThrowError(LoomRouteValidationError);
    expect(() => registry.setRoute({target, transport: "direct", state: "available", cost: Number.NaN})).toThrowError(LoomRouteValidationError);
  });

  it("copies node metadata instead of retaining a mutable input object", () => {
    const metadata: Record<string, unknown> = {region: "a"};
    const registry = new LoomRouteRegistry();
    const node = registry.registerNode(target, metadata);
    metadata.region = "b";
    expect(node.metadata).toEqual({region: "a"});
    expect(Object.isFrozen(node.metadata)).toBe(true);
  });
});
