import type { Session } from "./types";

const BASE = "/api/v1";
let csrfToken = "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function setCsrfToken(token?: string): void { csrfToken = token ?? ""; }
export function getCsrfToken(): string { return csrfToken; }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => undefined) as T | { error?: unknown; message?: unknown } | undefined;
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    if (body && typeof body === "object") {
      const candidate = (body as { error?: unknown; message?: unknown }).message ?? (body as { error?: unknown }).error;
      if (typeof candidate === "string") detail = candidate;
      else if (candidate && typeof candidate === "object" && "message" in candidate) detail = String((candidate as { message: unknown }).message);
    }
    throw new ApiError(detail, response.status);
  }
  return body as T;
}

export function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "GET", signal });
}

export function mutate<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  if (!csrfToken) return Promise.reject(new ApiError("Your session needs to be refreshed.", 401));
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "X-CSRF-Token": csrfToken },
  });
}

export async function login(operatorToken: string): Promise<Session> {
  const body = await request<{ csrfToken: string; operator?: { id?: string; name?: string } }>("/auth/login", {
    method: "POST", headers: { Authorization: `Bearer ${operatorToken}` },
  });
  const current: Session = { authenticated: true, csrfToken: body.csrfToken, user: { name: body.operator?.name ?? body.operator?.id, role: "Operator" } };
  setCsrfToken(current.csrfToken);
  return current;
}

export async function session(signal?: AbortSignal): Promise<Session> {
  const body = await get<{ csrfToken: string; operatorId?: string }>("/auth/session", signal);
  const current: Session = { authenticated: true, csrfToken: body.csrfToken, user: { name: body.operatorId, role: "Operator" } };
  setCsrfToken(current.csrfToken);
  return current;
}

export async function logout(): Promise<void> {
  await mutate<void>("/auth/logout");
  setCsrfToken();
}
