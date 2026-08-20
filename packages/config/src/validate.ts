import type {LoomConfig, ValidationIssue, LoomAgentConfig, LoomToolConfig, LoomPolicyConfig} from "./schema.js";
import {CURRENT_SCHEMA_VERSION} from "./schema.js";

const KNOWN_ROLES = ["planner", "researcher", "coder", "reviewer", "tester", "general"];
const KNOWN_PERMISSIONS: Array<string> = ["allow", "deny", "ask"];
const KNOWN_TRUST: Array<string> = ["untrusted", "trusted", "approved"];

/** Validate a Loom config. Returns structured issues; empty errors means valid. */
export function validateConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof config !== "object" || config === null) {
    return [{path: "$", message: "config must be an object", severity: "error"}];
  }
  const cfg = config as Record<string, unknown>;

  if (typeof cfg.schemaVersion !== "number") {
    issues.push({path: "schemaVersion", message: "missing required field schemaVersion (expected a number, e.g. 1)", severity: "error"});
  } else if (Math.floor(cfg.schemaVersion) !== CURRENT_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `unsupported schemaVersion ${cfg.schemaVersion}; V1.0 supports ${CURRENT_SCHEMA_VERSION}`,
      severity: "error",
    });
  }

  if (cfg.name !== undefined && typeof cfg.name !== "string") {
    issues.push({path: "name", message: "name must be a string", severity: "error"});
  }

  validateProvider(cfg.provider, issues);
  validateAgents(cfg.agents, issues);
  validateTools(cfg.tools, issues);
  validatePolicy(cfg.policy, issues);
  validateStringMap(cfg.permissions, "permissions", issues, KNOWN_PERMISSIONS);
  validateMcp(cfg.mcpServers, issues);

  // Trust fields
  for (const key of ["worker", "remote", "controlPlane", "daemon", "scheduler", "runtime", "planning", "review", "execution"]) {
    if (cfg[key] !== undefined && (typeof cfg[key] !== "object" || cfg[key] === null)) {
      issues.push({path: key, message: `${key} must be an object`, severity: "error"});
    }
  }
  const remote = cfg.remote as Record<string, unknown> | undefined;
  if (remote && typeof remote.trust === "string" && !KNOWN_TRUST.includes(remote.trust)) {
    issues.push({path: "remote.trust", message: `unknown trust "${remote.trust}"; expected one of ${KNOWN_TRUST.join(", ")}`, severity: "error"});
  }
  return issues;
}

function validateProvider(provider: unknown, issues: ValidationIssue[]) {
  if (provider === undefined) return;
  if (typeof provider !== "object" || provider === null) {
    issues.push({path: "provider", message: "provider must be an object", severity: "error"});
    return;
  }
  const p = provider as Record<string, unknown>;
  if (p.id !== undefined && typeof p.id !== "string") issues.push({path: "provider.id", message: "provider.id must be a string", severity: "error"});
  if (p.model !== undefined && typeof p.model !== "string") issues.push({path: "provider.model", message: "provider.model must be a string", severity: "error"});
  if (p.apiKeyEnv !== undefined && typeof p.apiKeyEnv !== "string") issues.push({path: "provider.apiKeyEnv", message: "provider.apiKeyEnv must be a string", severity: "error"});
}

function validateAgents(agents: unknown, issues: ValidationIssue[]) {
  if (agents === undefined) return;
  if (!Array.isArray(agents)) {
    issues.push({path: "agents", message: "agents must be an array", severity: "error"});
    return;
  }
  const ids = new Set<string>();
  agents.forEach((agent, i) => {
    const path = `agents[${i}]`;
    if (typeof agent !== "object" || agent === null) {
      issues.push({path, message: "agent must be an object", severity: "error"});
      return;
    }
    const a = agent as LoomAgentConfig;
    if (typeof a.id !== "string" || !a.id) {
      issues.push({path: `${path}.id`, message: "agent requires a non-empty string id", severity: "error"});
    } else if (ids.has(a.id)) {
      issues.push({path: `${path}.id`, message: `duplicate agent id "${a.id}"`, severity: "error"});
    } else {
      ids.add(a.id);
    }
    if (a.role !== undefined && !KNOWN_ROLES.includes(a.role)) {
      issues.push({path: `${path}.role`, message: `unknown role "${a.role}"; expected one of ${KNOWN_ROLES.join(", ")}`, severity: "error"});
    }
  });
}

function validateTools(tools: unknown, issues: ValidationIssue[]) {
  if (tools === undefined) return;
  if (!Array.isArray(tools)) {
    issues.push({path: "tools", message: "tools must be an array", severity: "error"});
    return;
  }
  const names = new Set<string>();
  tools.forEach((tool, i) => {
    const path = `tools[${i}]`;
    if (typeof tool !== "object" || tool === null) {
      issues.push({path, message: "tool must be an object", severity: "error"});
      return;
    }
    const t = tool as LoomToolConfig;
    if (typeof t.name !== "string" || !t.name) {
      issues.push({path: `${path}.name`, message: "tool requires a non-empty string name", severity: "error"});
    } else if (names.has(t.name)) {
      issues.push({path: `${path}.name`, message: `duplicate tool name "${t.name}"`, severity: "error"});
    } else {
      names.add(t.name);
    }
    if (t.permissions !== undefined && !KNOWN_PERMISSIONS.includes(t.permissions)) {
      issues.push({path: `${path}.permissions`, message: `unknown permission "${t.permissions}"; expected one of ${KNOWN_PERMISSIONS.join(", ")}`, severity: "error"});
    }
  });
}

function validatePolicy(policy: unknown, issues: ValidationIssue[]) {
  if (policy === undefined) return;
  if (typeof policy !== "object" || policy === null) {
    issues.push({path: "policy", message: "policy must be an object", severity: "error"});
    return;
  }
  const p = policy as LoomPolicyConfig;
  validateStringMap(p.tools, "policy.tools", issues, KNOWN_PERMISSIONS);
  if (p.workerTrust !== undefined && !KNOWN_TRUST.includes(p.workerTrust)) {
    issues.push({path: "policy.workerTrust", message: `unknown workerTrust "${p.workerTrust}"; expected one of ${KNOWN_TRUST.join(", ")}`, severity: "error"});
  }
}

function validateStringMap(map: unknown, path: string, issues: ValidationIssue[], allowed?: string[]) {
  if (map === undefined) return;
  if (typeof map !== "object" || map === null) {
    issues.push({path, message: `${path} must be an object`, severity: "error"});
    return;
  }
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    if (typeof value !== "string" || (allowed && !allowed.includes(value))) {
      issues.push({path: `${path}.${key}`, message: `invalid value "${String(value)}"; expected one of ${allowed?.join(", ")}`, severity: "error"});
    }
  }
}

function validateMcp(mcp: unknown, issues: ValidationIssue[]) {
  if (mcp === undefined) return;
  if (typeof mcp !== "object" || mcp === null) {
    issues.push({path: "mcpServers", message: "mcpServers must be an object", severity: "error"});
    return;
  }
  for (const [name, server] of Object.entries(mcp as Record<string, unknown>)) {
    if (typeof server !== "object" || server === null || typeof (server as Record<string, unknown>).command !== "string") {
      issues.push({path: `mcpServers.${name}`, message: "mcpServer requires a command string", severity: "error"});
    }
  }
}

/** Throw a single aggregated error with helpful lines; used by CLI/SDK on load. */
export function assertValid(config: unknown): asserts config is LoomConfig {
  const issues = validateConfig(config).filter((i) => i.severity === "error");
  if (issues.length > 0) {
    const lines = issues.map((i) => `  - ${i.path}: ${i.message}`);
    throw new Error(`Invalid Loom configuration:\n${lines.join("\n")}`);
  }
}

export function isValid(config: unknown): config is LoomConfig {
  return validateConfig(config).every((i) => i.severity !== "error");
}
