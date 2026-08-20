export type Route =
  | { page: "login" }
  | { page: "dashboard" }
  | { page: "agents" }
  | { page: "agent"; id: string }
  | { page: "workers" }
  | { page: "worker"; id: string }
  | { page: "jobs" | "schedules" | "approvals" | "traces" | "routes" }
  | { page: "not-found" };

export function routeFor(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { page: "dashboard" };
  if (parts.length === 1 && ["login", "agents", "workers", "jobs", "schedules", "approvals", "traces", "routes"].includes(parts[0])) {
    return { page: parts[0] as "login" | "agents" | "workers" | "jobs" | "schedules" | "approvals" | "traces" | "routes" };
  }
  if (parts.length === 2 && parts[0] === "agents") return { page: "agent", id: parts[1] };
  if (parts.length === 2 && parts[0] === "workers") return { page: "worker", id: parts[1] };
  return { page: "not-found" };
}

export function routeHref(page: string, id?: unknown): string {
  const suffix = typeof id === "string" ? `/${encodeURIComponent(id)}` : "";
  return `/${page === "dashboard" ? "" : page}${suffix}`;
}
