import { afterEach, describe, expect, it, vi } from "vitest";
import { getCsrfToken, login, mutate, session, setCsrfToken } from "./api";

afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(); });

describe("control API client", () => {
  it("exchanges an operator token through Authorization without putting it in the body", async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ operator: { name: "Ada" }, csrfToken: "csrf-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const current = await login("secret-operator-token");
    const [, init] = fetcher.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-operator-token");
    expect(init?.body).toBeUndefined();
    expect(current).toMatchObject({ authenticated: true, user: { name: "Ada" } });
    expect(getCsrfToken()).toBe("csrf-1");
  });

  it("rotates the in-memory CSRF token when refreshing the cookie session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ operatorId: "op-1", csrfToken: "csrf-2" }), { status: 200 })));
    expect(await session()).toMatchObject({ authenticated: true, user: { name: "op-1" } });
    expect(getCsrfToken()).toBe("csrf-2");
  });

  it("adds the CSRF header and same-origin credentials to mutations", async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher); setCsrfToken("csrf-3");
    await mutate("/jobs/j1/cancel");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/jobs/j1/cancel");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-3");
  });
});
