import { useCallback, useEffect, useState } from "preact/hooks";
import { ApiError, logout, session } from "./api";
import { StatusPill } from "./components";
import { useEvents } from "./hooks";
import { routeFor, routeHref, type Route } from "./routing";
import { AgentDetailPage, AgentsPage, ApprovalsPage, DashboardPage, JobsPage, LoginPage, RoutesPage, SchedulesPage, TracesPage, WorkerDetailPage, WorkersPage } from "./pages";
import type { Session } from "./types";

const navigation = [
  ["dashboard", "Overview"], ["agents", "Agents"], ["workers", "Workers"], ["jobs", "Jobs"],
  ["schedules", "Schedules"], ["approvals", "Approvals"], ["traces", "Traces"], ["routes", "Routes"],
] as const;

function currentRoute(): Route { return routeFor(window.location.pathname); }

export function App() {
  const [current, setCurrent] = useState<Route>(currentRoute);
  const [auth, setAuth] = useState<Session>();
  const [authError, setAuthError] = useState("");
  const [generation, setGeneration] = useState(0);
  const invalidate = useCallback(() => setGeneration(value => value + 1), []);
  const stream = useEvents(Boolean(auth?.authenticated), invalidate);

  const refreshSession = useCallback(async () => {
    try {
      const next = await session(); setAuth(next); setAuthError("");
      if (!next.authenticated && currentRoute().page !== "login") navigate("/login", setCurrent, true);
      else if (next.authenticated && currentRoute().page === "login") navigate("/", setCurrent, true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { setAuth({ authenticated: false }); navigate("/login", setCurrent, true); }
      else setAuthError(cause instanceof Error ? cause.message : "Could not verify your session.");
    }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const onPop = () => setCurrent(currentRoute());
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement) || target.origin !== location.origin || target.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(target.pathname, setCurrent);
    };
    window.addEventListener("popstate", onPop); document.addEventListener("click", onClick);
    return () => { window.removeEventListener("popstate", onPop); document.removeEventListener("click", onClick); };
  }, []);

  if (!auth) return <div class="boot" role="status"><div class="brand-mark">L</div><span>{authError || "Opening operator console…"}</span>{authError && <button class="text-button" onClick={() => void refreshSession()}>Try again</button>}</div>;
  if (!auth.authenticated || current.page === "login") return <LoginPage onLogin={() => { setAuth({ authenticated: true }); navigate("/", setCurrent, true); void refreshSession(); }} />;

  return <div class="app-shell">
    <a class="skip-link" href="#main">Skip to content</a>
    <aside class="sidebar">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">L</span><span>Loom <small>operator</small></span></a>
      <nav aria-label="Primary">{navigation.map(([page, label]) => <a key={page} class={routeActive(current, page) ? "active" : ""} href={routeHref(page)}><span aria-hidden="true">{navMark(page)}</span>{label}</a>)}</nav>
      <div class="sidebar-foot"><div class="operator"><span class="operator-avatar" aria-hidden="true">{auth.user?.name?.slice(0, 1).toUpperCase() || "O"}</span><span><strong>{auth.user?.name || "Operator"}</strong><small>{auth.user?.role || "Local session"}</small></span></div><button class="text-button" onClick={async () => { if (!window.confirm("Sign out of this operator session?")) return; await logout(); setAuth({ authenticated: false }); navigate("/login", setCurrent, true); }}>Sign out</button></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="environment"><span>LOCAL</span><strong>Durable runtime</strong></div><div class="stream-state" title="Live updates reconnect automatically"><StatusPill value={stream} /></div></header>
      <main id="main">{renderPage(current, generation)}</main>
    </div>
  </div>;
}

function navigate(path: string, setter: (route: Route) => void, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", path); setter(routeFor(path)); window.scrollTo({ top: 0, behavior: "instant" });
}
function routeActive(route: Route, page: string) { return route.page === page || (page === "agents" && route.page === "agent") || (page === "workers" && route.page === "worker"); }
function navMark(page: string) { return ({ dashboard: "⌁", agents: "A", workers: "W", jobs: "J", schedules: "S", approvals: "!", traces: "T", routes: "R" } as Record<string, string>)[page]; }
function renderPage(route: Route, generation: number) {
  switch (route.page) {
    case "dashboard": return <DashboardPage generation={generation} />;
    case "agents": return <AgentsPage generation={generation} />;
    case "agent": return <AgentDetailPage id={route.id} generation={generation} />;
    case "workers": return <WorkersPage generation={generation} />;
    case "worker": return <WorkerDetailPage id={route.id} generation={generation} />;
    case "jobs": return <JobsPage generation={generation} />;
    case "schedules": return <SchedulesPage generation={generation} />;
    case "approvals": return <ApprovalsPage generation={generation} />;
    case "traces": return <TracesPage generation={generation} />;
    case "routes": return <RoutesPage generation={generation} />;
    default: return <section class="not-found"><p class="eyebrow">404 / Unknown route</p><h1>This console view does not exist.</h1><a class="button button--primary" href="/">Return to overview</a></section>;
  }
}
