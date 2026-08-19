export type AgentStatus = "created" | "running" | "waiting" | "paused" | "recovering" | "completed" | "failed" | "stopped";
export type Message = { role: "user" | "assistant" | "tool"; content: string };
export type Agent = { id: string; task: string; status: AgentStatus; createdAt: string; updatedAt: string; result?: string; error?: string };
export type TraceEvent = { id?: number; agentId: string; type: string; data: Record<string, unknown>; createdAt: string };
export type Checkpoint = { agentId: string; step: number; messages: Message[]; status: AgentStatus; result?: string; phase?: string; checkpointId?: string; providerRequestId?: string };
export type ToolCall = {name:string; input:Record<string,unknown>; id?:string};
export type ProviderRequest = {messages:Message[]; tools?:ToolDefinition[]; model?:string; system?:string};
export type ProviderResponse = {content:string; toolCalls?:ToolCall[]; usage?:Record<string,number>; finishReason?:string; requestId?:string; metadata?:Record<string,unknown>};
export interface Provider { readonly name: string; complete(messages:Message[]):Promise<ProviderResponse>; generate?(request:ProviderRequest):Promise<ProviderResponse>; }
export type PermissionLevel = "allow" | "deny" | "ask";
export type ToolDefinition = {name:string; description:string; inputSchema?:Record<string,unknown>; requiredPermission?:PermissionLevel};
export interface Tool {name:string; description:string; inputSchema?:Record<string,unknown>; execute(input:Record<string,unknown>):Promise<string>}
export type MemoryEntry = {agentId:string; key:string; value:string; updatedAt:string};
export type TaskStatus = "pending" | "ready" | "running" | "waiting" | "blocked" | "completed" | "failed" | "needs_approval";
export type FailurePolicy = "retryable" | "non_retryable" | "blocked" | "needs_approval" | "needs_human";
export type ExecutionPhase = "plan" | "execute" | "verify";
export type Plan = {id:string;agentId:string;goal:string;status:AgentStatus;phase:ExecutionPhase;createdAt:string;updatedAt:string};
export type PlanTask = {id:string;planId:string;title:string;kind:string;status:TaskStatus;dependencies:string[];retryCount:number;maxRetries:number;failurePolicy?:FailurePolicy;blockedReason?:string;result?:string;position:number;createdAt:string;updatedAt:string};
export type ApprovalRequest = {id:string;agentId:string;taskId?:string;toolCallId?:string;toolName:string;input:Record<string,unknown>;status:"pending"|"approved"|"denied";createdAt:string;decidedAt?:string};
export type Artifact = {id:string;agentId:string;taskId?:string;checkpointId?:string;path:string;operation:"created"|"modified"|"deleted";createdAt:string};
export type TaskCheckpoint = {id:string;agentId:string;planId:string;taskId?:string;phase:ExecutionPhase;step:number;snapshot:Record<string,unknown>;createdAt:string};
