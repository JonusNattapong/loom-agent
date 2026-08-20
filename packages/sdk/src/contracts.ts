/**
 * @loom/sdk/contracts
 *
 * Stable public contracts for Loom V1.0.
 *
 * These types are the platform promise. Internal packages may evolve, but
 * types exported here follow the 1.x backward-compatibility policy documented
 * in the SDK README: public stable contracts remain compatible within 1.x,
 * experimental contracts may change within minor versions and are marked
 * @experimental.
 *
 * Implementation note: these contracts intentionally reuse the primitive types
 * from @loom/core (Provider, Message, ToolDefinition, AgentRole, ...) so the
 * SDK is a thin, stable facade over the existing runtime rather than a second
 * runtime.
 */
import type {
  AgentRole,
  Message,
  Provider,
  ProviderRequest,
  ProviderResponse,
  ToolDefinition,
  Tool,
  PermissionLevel,
  MemoryScope,
  Visibility,
} from "@loom/core";

export type {AgentRole, Message, Provider, ProviderRequest, ProviderResponse, ToolDefinition, Tool, PermissionLevel, MemoryScope, Visibility} from "@loom/core";

/** @stable SDK version tuple. Bump the minor for new stable additions. */
export const SDK_API_VERSION = "1.1.0" as const;

/** Loom protocol major version. Workers with an incompatible major are rejected. */
export const PROTOCOL_MAJOR = 1 as const;

/** Stable database schema version reported by the runtime. */
export const SCHEMA_VERSION = 13 as const;

export type ProviderCapability =
  | "text"
  | "vision"
  | "tool_calls"
  | "structured_output"
  | "streaming";

export type ProviderErrorKind =
  | "auth_error"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "cancelled";

export interface ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly providerId: string;
}

export type ProviderStatus = "ok" | "degraded" | "unavailable";

export interface ProviderInfo {
  id: string;
  kind: string;
  model?: string;
  capabilities: ProviderCapability[];
  status: ProviderStatus;
}

/** Standardized provider context passed alongside a request. */
export interface ProviderContext {
  agentId?: string;
  taskId?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

/** Public agent definition used by application code. */
export interface AgentDefinition {
  id: string;
  role?: AgentRole;
  provider?: string;
  model?: string;
  system?: string;
  goal?: string;
  maxRounds?: number;
  tools?: string[];
  skills?: string[];
  /** @experimental execution placement hint; runtime owns routing. */
  execution?: AgentExecutionRequirement;
}

/** Stable execution requirement descriptor (no internal routing classes). */
export interface AgentExecutionRequirement {
  capabilities?: string[];
  trust?: "trusted" | "untrusted";
  location?: "local" | "remote" | "any";
}

/** Public tool definition for SDK authors. */
export interface SdkToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  permissions?: PermissionLevel;
  /** Whether the tool requires explicit approval before execution. */
  approval?: boolean;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string> | string;
}

export interface ToolContext {
  agentId?: string;
  taskId?: string;
  toolCallId?: string;
  signal?: AbortSignal;
  workspace: string;
  emit: (type: string, data: Record<string, unknown>) => void;
}

export interface ToolResult {
  output: string;
  truncated?: boolean;
}

/** Public skill definition. */
export interface SdkSkillDefinition {
  name: string;
  description: string;
  instructions?: string;
  tools?: string[];
  /** @experimental capability requirements a skill declares. */
  requires?: string[];
}

/** Stable event contract surfaced to SDK consumers. */
export type LoomEvent =
  | {eventVersion: 1; type: "agent.started"; agentId: string; role?: string; goal?: string; at: number}
  | {eventVersion: 1; type: "agent.completed"; agentId: string; status: string; result?: string; at: number}
  | {eventVersion: 1; type: "task.updated"; taskId: string; status: string; agentId?: string; at: number}
  | {eventVersion: 1; type: "tool.started"; agentId: string; tool: string; toolCallId?: string; at: number}
  | {eventVersion: 1; type: "tool.completed"; agentId: string; tool: string; toolCallId?: string; at: number}
  | {eventVersion: 1; type: "job.updated"; jobId: string; status: string; at: number}
  | {eventVersion: 1; type: "worker.updated"; workerId: string; status: string; at: number}
  | {eventVersion: 1; type: "approval.requested"; approvalId: string; tool: string; agentId?: string; at: number}
  | {eventVersion: 1; type: "approval.decided"; approvalId: string; decision: "approved" | "denied"; at: number};

export type LoomEventType = LoomEvent["type"];

/** Logical address in the Loom overlay (stable string form: loom://...). */
export type LoomAddress = `loom://${string}`;

/** Route descriptor separating logical identity from connection/epoch. */
export interface LoomRoute {
  address: LoomAddress;
  workerId?: string;
  connectionEpoch?: number;
  leaseId?: string;
}

/** Worker capability descriptor (stable, no internal routing types). */
export interface WorkerCapability {
  id: string;
  label?: string;
  version?: string;
}

export type WorkerTrust = "untrusted" | "trusted" | "approved";

/** Public bot transport adapter contract. */
export interface BotTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: unknown, recipientId?: string): Promise<void>;
  onEvent(handler: (event: unknown) => void): void;
}

export interface BotDefinition {
  id: string;
  agent: string;
  transport: BotTransport;
  description?: string;
}

/** @experimental Agent Arena world adapter foundation. */
export interface WorldAdapter<TObservation = unknown, TAction = unknown> {
  observe(agentId: string): Promise<TObservation>;
  act(agentId: string, action: TAction): Promise<ActionResult>;
}

export interface ActionResult {
  ok: boolean;
  details?: Record<string, unknown>;
}

/** Loom application manifest (versioned config schema). */
export interface LoomAppManifest {
  schemaVersion: number;
  name: string;
  runtime?: {
    maxAgents?: number;
    maxConcurrentJobs?: number;
  };
  policy?: LoomPolicy;
  agents?: Array<AgentDefinition | string>;
  skills?: Array<SdkSkillDefinition | string>;
  tools?: Array<SdkToolDefinition | string>;
  bots?: BotDefinition[];
  provider?: {
    id: string;
    model?: string;
    apiKeyEnv?: string;
  };
}

export interface LoomPolicy {
  tools?: Record<string, PermissionLevel>;
  approval?: Record<string, boolean>;
  workerTrust?: WorkerTrust;
  remoteExecution?: boolean;
  workspaceRestricted?: boolean;
}
