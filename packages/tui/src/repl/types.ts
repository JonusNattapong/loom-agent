import type { Agent, AgentResult, PermissionLevel, Provider } from "@loom-agent/core";

export interface ReplConfig {
  provider?: Provider;
  model?: string;
  cwd?: string;
  maxTasks?: number;
  maxAgents?: number;
  permissions?: Record<string, PermissionLevel>;
}

export interface ReplMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}
