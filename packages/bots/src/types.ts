/**
 * Bot Transport Abstraction
 * 
 * Platform-independent interface for connecting external transports
 * (Discord, Telegram, Web, etc.) to the Loom bot runtime.
 */
import { RoleRegistry } from "@loom/coordinator";

export type BotEventType =
  | "message"
  | "mention"
  | "reaction"
  | "attachment"
  | "command"
  | "session_started"
  | "session_closed";

export interface BotEvent {
  id: string;
  transport: string;
  type: BotEventType;
  botId: string;
  workspaceId?: string;
  channelId?: string;
  threadId?: string;
  userId?: string;
  text?: string;
  attachments?: BotAttachment[];
  timestamp: string;
  rawMetadata?: Record<string, unknown>;
}

export interface BotAttachment {
  id: string;
  name: string;
  contentType?: string;
  size?: number;
  url?: string;
}

export interface OutboundBotMessage {
  id: string;
  type: BotEventType;
  text?: string;
  attachments?: BotAttachment[];
  timestamp: string;
}

export interface BotTransport {
  readonly type: string;

  start(): Promise<void>;

  stop(): Promise<void>;

  send(message: OutboundBotMessage): Promise<void>;
}
