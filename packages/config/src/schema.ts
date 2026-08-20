/**
 * @loom/config — Versioned, validated Loom configuration schema.
 *
 * This is the public configuration contract for V1.0. Application code and the
 * CLI depend on this shape, not on SQLite table names or private runtime classes.
 *
 * Compatibility: schemaVersion 1 is supported. Future versions may add fields;
 * loaders must reject unknown major versions with a clear error.
 */
import type {PermissionLevel, AgentRole} from "@loom/core";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface LoomConfig {
  schemaVersion: number;
  name?: string;
  provider?: {
    id?: string;
    model?: string;
    apiKeyEnv?: string;
  };
  agents?: LoomAgentConfig[];
  tools?: LoomToolConfig[];
  skills?: string[];
  runtime?: {
    maxAgents?: number;
    maxConcurrentJobs?: number;
    maxModelRoundsPerTask?: number;
    maxToolCallsPerTask?: number;
  };
  planning?: {
    enabled?: boolean;
    maxTasks?: number;
    maxDepth?: number;
  };
  review?: {
    enabled?: boolean;
    maxRepairRounds?: number;
  };
  execution?: {
    maxModelRoundsPerTask?: number;
    maxToolCallsPerTask?: number;
  };
  permissions?: Record<string, PermissionLevel>;
  policy?: LoomPolicyConfig;
  mcpServers?: Record<string, {command: string; args?: string[]; env?: Record<string, string>}>;
  worker?: {
    id?: string;
    controller?: string;
    tokenEnv?: string;
    capabilities?: string[];
    allowedTools?: string[];
    allowShell?: boolean;
    workspace?: string;
    workspaceId?: string;
    stateFile?: string;
  };
  remote?: {
    enabled?: boolean;
    listen?: {host?: string; port?: number; path?: string};
    tokenEnv?: string;
    workerId?: string;
    trust?: "untrusted" | "trusted" | "approved";
    maxMessageBytes?: number;
    authTimeoutMs?: number;
    tlsCertFile?: string;
    tlsKeyFile?: string;
  };
  controlPlane?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    readOnly?: boolean;
    sessionTtlMs?: number;
    sessionIdleMs?: number;
    publicOrigin?: string;
    allowedOrigins?: string[];
    cookieSecure?: boolean;
    tlsCertFile?: string;
    tlsKeyFile?: string;
  };
  daemon?: {
    maxConcurrentJobs?: number;
    heartbeatIntervalMs?: number;
    staleAfterMs?: number;
    shutdownGraceMs?: number;
  };
  scheduler?: {
    enabled?: boolean;
    maxSleepMs?: number;
  };
}

export interface LoomAgentConfig {
  id: string;
  role?: AgentRole;
  provider?: string;
  model?: string;
  system?: string;
  goal?: string;
  tools?: string[];
  skills?: string[];
}

export interface LoomToolConfig {
  name: string;
  description?: string;
  permissions?: PermissionLevel;
  approval?: boolean;
}

export interface LoomPolicyConfig {
  tools?: Record<string, PermissionLevel>;
  approval?: Record<string, boolean>;
  workerTrust?: "untrusted" | "trusted" | "approved";
  remoteExecution?: boolean;
  workspaceRestricted?: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}
