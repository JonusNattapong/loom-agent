export type AgentStatus = "created" | "running" | "waiting" | "paused" | "recovering" | "completed" | "failed" | "cancelled" | "stopped";
export type AgentRole = "planner" | "researcher" | "coder" | "reviewer" | "tester" | "general";
export type Message = { role: "user" | "assistant" | "tool"; content: string };
export type Agent = { id: string; task: string; goal: string; role: AgentRole; parentAgentId?: string; rootAgentId: string; status: AgentStatus; createdAt: string; updatedAt: string; result?: string; error?: string };
export type TraceCorrelation = {rootAgentId?:string;parentAgentId?:string;taskId?:string;delegationId?:string;messageId?:string;toolCallId?:string;checkpointId?:string};
export type TraceEvent = TraceCorrelation & { id?: number; agentId: string; type: string; data: Record<string, unknown>; createdAt: string };
export type Checkpoint = { agentId: string; step: number; messages: Message[]; status: AgentStatus; result?: string; phase?: string; checkpointId?: string; providerRequestId?: string };
export type ToolCall = {name:string; input:Record<string,unknown>; id?:string};
export type ProviderRequest = {messages:Message[]; tools?:ToolDefinition[]; model?:string; system?:string};
export type ProviderResponse = {content:string; toolCalls?:ToolCall[]; usage?:Record<string,number>; finishReason?:string; requestId?:string; metadata?:Record<string,unknown>};
export interface Provider { readonly name: string; complete(messages:Message[]):Promise<ProviderResponse>; generate?(request:ProviderRequest):Promise<ProviderResponse>; }
export type PermissionLevel = "allow" | "deny" | "ask";
export type ToolDefinition = {name:string; description:string; inputSchema?:Record<string,unknown>; requiredPermission?:PermissionLevel};
export interface Tool {name:string; description:string; inputSchema?:Record<string,unknown>; execute(input:Record<string,unknown>):Promise<string>}
export type MemoryScope = "agent" | "root-task" | "project";
export type Visibility = "private" | "parent-visible" | "team-visible";
export type MemoryEntry = {agentId:string; key:string; value:string; updatedAt:string;scope?:MemoryScope;visibility?:Visibility;rootAgentId?:string};
export type TaskStatus = "pending" | "ready" | "running" | "waiting" | "blocked" | "completed" | "failed" | "needs_approval";
export type FailurePolicy = "retryable" | "non_retryable" | "blocked" | "needs_approval" | "needs_human";
export type ExecutionPhase = "plan" | "execute" | "verify";
export type Plan = {id:string;agentId:string;goal:string;status:AgentStatus;phase:ExecutionPhase;createdAt:string;updatedAt:string};
export type PlanTask = {id:string;planId:string;title:string;kind:string;status:TaskStatus;dependencies:string[];retryCount:number;maxRetries:number;failurePolicy?:FailurePolicy;blockedReason?:string;result?:string;position:number;ownerAgentId?:string;leaseId?:string;leaseExpiresAt?:string;createdAt:string;updatedAt:string};
export type ApprovalRequest = {id:string;agentId:string;taskId?:string;toolCallId?:string;toolName:string;input:Record<string,unknown>;role?:AgentRole;reason?:string;argumentsSummary?:string;status:"pending"|"approved"|"denied";createdAt:string;decidedAt?:string};
export type ArtifactOperation = "created"|"modified"|"deleted"|"generated";
export type Artifact = {id:string;agentId:string;taskId?:string;checkpointId?:string;path:string;type:string;operation:ArtifactOperation;visibility:Visibility;createdAt:string};
export type TaskCheckpoint = {id:string;agentId:string;planId:string;taskId?:string;phase:ExecutionPhase;step:number;snapshot:Record<string,unknown>;createdAt:string};

export type DelegationStatus = "created"|"assigned"|"running"|"waiting"|"completed"|"failed"|"cancelled";
export type Delegation = {id:string;parentAgentId:string;childAgentId:string;taskId?:string;goal:string;status:DelegationStatus;failurePolicy?:FailurePolicy|"cancelled";createdAt:string;startedAt?:string;completedAt?:string;resultSummary?:string;failureReason?:string};
export type AgentMessageType = "request"|"response"|"status"|"artifact"|"error"|"cancel";
export type AgentMessage = {id:string;rootAgentId:string;fromAgentId:string;toAgentId:string;type:AgentMessageType;payload:unknown;visibility:Visibility;createdAt:string;deliveredAt?:string;acknowledgedAt?:string};
export type ArtifactReference = {path:string;type?:string;operation:ArtifactOperation;checkpointId?:string;visibility?:Visibility};
export type AgentResult = {id?:string;agentId?:string;delegationId?:string;status:"completed"|"failed";summary:string;artifacts?:ArtifactReference[];taskUpdates?:Array<{taskId:string;status:TaskStatus;result?:string}>;findings?:Record<string,unknown>;failurePolicy?:FailurePolicy|"cancelled";error?:string;createdAt?:string};
export type TaskLease = {id:string;taskId:string;agentId:string;status:"active"|"released"|"expired"|"cancelled";acquiredAt:string;expiresAt:string;releasedAt?:string};
export type RoleDefinition = {role:AgentRole;instructions:string;allowedTools:string[];allowedSkills:string[];completionCriteria:string[];model?:string};
