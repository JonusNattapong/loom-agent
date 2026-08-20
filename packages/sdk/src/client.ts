/**
 * @loom-agent/sdk/client — lightweight Control Plane API client for /api/v1.
 *
 * Uses the stable /api/v1 contract. No internal runtime imports.
 */
import type {LoomEvent} from "./contracts.js";

export interface LoomClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class LoomClient {
  private readonly base: string;
  private readonly token?: string;
  private readonly f: typeof fetch;

  constructor(options: LoomClientOptions) {
    this.base = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.f = options.fetchImpl ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {"accept": "application/json"};
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await this.f(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`loom api ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async login(operatorToken: string): Promise<{sessionToken: string; csrfToken: string}> {
    return this.request("POST", "/api/v1/auth/login", {token: operatorToken});
  }

  jobs = {
    list: (status?: string) => this.request<unknown[]>("GET", `/api/v1/jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    get: (id: string) => this.request<unknown>("GET", `/api/v1/jobs/${id}`),
    cancel: (id: string) => this.request<void>("POST", `/api/v1/jobs/${id}/cancel`),
    retry: (id: string) => this.request<void>("POST", `/api/v1/jobs/${id}/retry`),
  };

  approvals = {
    list: (rootAgentId?: string) => this.request<unknown[]>("GET", `/api/v1/approvals${rootAgentId ? `?rootAgentId=${encodeURIComponent(rootAgentId)}` : ""}`),
    get: (id: string) => this.request<unknown>("GET", `/api/v1/approvals/${id}`),
    approve: (id: string) => this.request<void>("POST", `/api/v1/approvals/${id}/approve`),
    deny: (id: string) => this.request<void>("POST", `/api/v1/approvals/${id}/deny`),
  };

  schedules = {
    list: () => this.request<unknown[]>("GET", "/api/v1/schedules"),
    create: (input: unknown) => this.request<unknown>("POST", "/api/v1/schedules", input),
    pause: (id: string) => this.request<void>("POST", `/api/v1/schedules/${id}/pause`),
    resume: (id: string) => this.request<void>("POST", `/api/v1/schedules/${id}/resume`),
    remove: (id: string) => this.request<void>("DELETE", `/api/v1/schedules/${id}`),
  };

  workers = {
    list: () => this.request<unknown[]>("GET", "/api/v1/workers"),
  };

  agents = {
    list: () => this.request<unknown[]>("GET", "/api/v1/agents"),
  };

  async health(): Promise<{status: string}> {
    return this.request("GET", "/api/v1/health");
  }

  /** Subscribe to SSE control events. Returns a stop function. */
  subscribeEvents(onEvent: (event: LoomEvent) => void, onError?: (err: Error) => void): () => void {
    const url = `${this.base}/api/v1/events`;
    const source = new EventSourceShim(url, this.token);
    source.onmessage = (data: string) => {
      try { onEvent(JSON.parse(data) as LoomEvent); } catch (e) { onError?.(e as Error); }
    };
    source.onerror = (err: Error) => onError?.(err);
    return () => source.close();
  }
}

/** Minimal EventSource-compatible shim so the client works in Node without DOM. */
class EventSourceShim {
  private controller?: AbortController;
  onmessage?: (data: string) => void;
  onerror?: (err: Error) => void;
  constructor(private readonly url: string, private readonly token?: string) {
    this.connect();
  }
  private async connect() {
    try {
      const headers: Record<string, string> = {accept: "text/event-stream"};
      if (this.token) headers["authorization"] = `Bearer ${this.token}`;
      this.controller = new AbortController();
      const res = await fetch(this.url, {headers, signal: this.controller.signal});
      if (!res.body) throw new Error("no response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const data = part.split("\n").find((l) => l.startsWith("data: "));
          if (data) this.onmessage?.(data.slice(6));
        }
      }
    } catch (err) {
      this.onerror?.(err as Error);
    }
  }
  close() { this.controller?.abort(); }
}
