export type AgentStatus = "running" | "completed" | "failed" | "stopped";
export type Message = { role: "user" | "assistant" | "tool"; content: string };
export type Agent = { id: string; task: string; status: AgentStatus; createdAt: string; updatedAt: string; result?: string; error?: string };
export type TraceEvent = { id?: number; agentId: string; type: string; data: Record<string, unknown>; createdAt: string };
export type Checkpoint = { agentId: string; step: number; messages: Message[]; status: AgentStatus; result?: string };
export interface Provider { readonly name: string; complete(messages: Message[]): Promise<{content:string; toolCalls?: ToolCall[]}>; }
export type ToolCall = {name:string; input:Record<string,unknown>};
export interface Tool {name:string; description:string; execute(input:Record<string,unknown>):Promise<string>}
