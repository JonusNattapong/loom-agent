import {afterEach,describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {ControlPlaneService,ControlServer,hashOperatorToken,type ControlState} from "./index.js";
import {StateStore} from "@loom-agent/state";

const servers: ControlServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.stop())); });

async function fixture(options: Record<string, unknown> = {}) {
  const state = new StateStore(":memory:");
  const raw = "a".repeat(64);
  state.createOperatorCredential({id: "op1", name: "Operator", tokenHash: hashOperatorToken(raw)});
  const service = new ControlPlaneService(state as unknown as ControlState, {daemonStatus: () => ({running: true})});
  const server = new ControlServer(service, {port: 0, ...options});
  servers.push(server);
  await server.start();
  const base = `http://127.0.0.1:${server.address()!.port}`;
  return {state, raw, server, base};
}

async function login(base: string, raw: string) {
  const res = await fetch(`${base}/api/v1/auth/login`, {method: "POST", headers: {"authorization": `Bearer ${raw}`}});
  const body = await res.json() as {sessionToken: string; csrfToken: string};
  const cookie = res.headers.get("set-cookie")!.split(";", 1)[0];
  return {sessionToken: body.sessionToken, csrf: body.csrfToken, cookie};
}

/** Documents that the stable /api/v1 surface is present and responds. */
describe("Control API /api/v1 compatibility", () => {
  it("exposes all documented stable endpoints", async () => {
    const {base, raw} = await fixture();
    const {cookie} = await login(base, raw);
    const auth = {cookie};

    const checks: Array<[string, string, number]> = [
      ["GET", "/api/v1/health", 200],
      ["GET", "/api/v1/summary", 200],
      ["GET", "/api/v1/agents", 200],
      ["GET", "/api/v1/jobs", 200],
      ["GET", "/api/v1/schedules", 200],
      ["GET", "/api/v1/approvals", 200],
      ["GET", "/api/v1/workers", 200],
      ["GET", "/api/v1/routes", 200],
      ["GET", "/api/v1/traces", 200],
      ["GET", "/api/v1/audit", 200],
    ];
    for (const [method, path, expected] of checks) {
      const res = await fetch(`${base}${path}`, {method, headers: auth});
      expect(res.status, `${method} ${path}`).toBe(expected);
    }
  });

  it("rejects unauthenticated mutations", async () => {
    const {base, state} = await fixture();
    const job = state.enqueueJob({type: "agent_run", payload: {goal: "g"}});
    const res = await fetch(`${base}/api/v1/jobs/${job.id}/cancel`, {method: "POST"});
    expect(res.status).toBe(401);
  });

  it("openapi.json is valid and lists the stable paths", async () => {
    const spec = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));
    expect(spec.openapi).toMatch(/^3\./);
    const paths = Object.keys(spec.paths);
    for (const p of ["/api/v1/health", "/api/v1/agents", "/api/v1/jobs", "/api/v1/approvals", "/api/v1/schedules", "/api/v1/workers", "/api/v1/routes"]) {
      expect(paths).toContain(p);
    }
    // version is 1.x
    expect(spec.info.version.startsWith("1.")).toBe(true);
  });
});
