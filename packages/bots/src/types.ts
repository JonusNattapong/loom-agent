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

export interface BotAttachment {
  id: string;
  name: string;
  contentType?: string;
  size?: number;
  url?: string;
}

/** Outbound message sent from bot to transport */
export interface OutboundBotMessage {
  id: string;
  type: BotEventType;
  text?: string;
  attachments?: BotAttachment[];
  timestamp: string;
}

/**
 * Discriminated union for known Discord event types
 * (used by the Event Router to determine routing behavior)
 */
export type DiscordInboundEvent =
  | {
      /** Direct message from a user to the bot */
      type: "message";
      /** Discord message ID */
      discordId: string;
      /** Bot user ID */
      botUserId: string;
      /** Channel ID (DM: user@bot, Guild: guild@channel) */
      channelId: string;
      /** Thread ID (optional, for thread conversations) */
      threadId?: string;
      /** Message content */
      content: string;
      /** Attachments array */
      attachments: Array<{
        id: string;
        filename: string;
        size: number;
        contentType?: string;
      }>;
      /** Message timestamp */
      timestamp: string;
    }
  | {
    /** Bot mention in a channel */
    type: "mention";
    /** Discord message ID */
    discordId: string;
    /** Channel ID */
    channelId: string;
    /** Bot mention string */
    mentionString: string;
    /** Message content following the mention */
    content: string;
    /** Attachments array */
    attachments: Array<{
      id: string;
      filename: string;
      size: number;
      contentType?: string;
    }>;
    /** Message timestamp */
    timestamp: string;
  }
  | {
    /** Reaction event */
    type: "reaction";
    /** Discord message ID */
    discordId: string;
    /** Emoji name/identifier */
    emoji: string;
    /** User who reacted */
    userId: string;
    /** Message thread/context */
    channelId: string;
    /** Message timestamp */
    timestamp: string;
  }
  | {
    /** Command event (e.g., /status, /reset) */
    type: "command";
    /** Discord message ID */
    discordId: string;
    /** Channel ID */
    channelId: string;
    /** Command name */
    command: string;
    /** Command arguments */
    args: string[];
    /** Message content */
    content: string;
    /** Attachments array */
    attachments: Array<{
      id: string;
      filename: string;
      size: number;
      contentType?: string;
    }>;
    /** Message timestamp */
    timestamp: string;
  };

/**
 * Transport interface for platform-independent bot communication.
 * Implementations must satisfy this contract to integrate with the
 * Loom bot runtime.
 */
export interface BotTransport {
  readonly type: string;

  /**
   * Start the transport connection.
   * Establishes websocket/session with the platform.
   */
  start(): Promise<void>;

  /**
   * Stop the transport connection.
   * Gracefully disconnects and cleans up resources.
   */
  stop(): Promise<void>;

  /**
   * Send an outbound message to the platform.
   * @param message - The message to deliver to the platform
   */
  send(message: OutboundBotMessage): Promise<void>;
}
