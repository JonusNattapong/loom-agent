/**
 * Base Transport Implementation
 * 
 * Base class providing common functionality for transport implementations.
 * Subclasses must implement the abstract methods.
 */
import { BotTransport, BotEvent, BotEventType, BotAttachment, OutboundBotMessage } from "./types";

export abstract class BaseTransport {
  readonly type: string;

  constructor(readonly type: string) {}

  /** Start the transport connection (must be implemented by subclass) */
  abstract start(): Promise<void>;

  /** Stop the transport connection (must be implemented by subclass) */
  abstract stop(): Promise<void>;

  /** Send an outbound message through the transport (must be implemented by subclass) */
  abstract send(message: OutboundBotMessage): Promise<void>;

  /**
   * Normalize a platform-specific incoming event into a standardized BotEvent.
   * Subclasses must implement this to convert platform events
   * into the common BotEvent format.
   */
  abstract normalizeEvent(event: any): BotEvent;

  /**
   * Create a BotEvent from a platform message.
   * Default implementation that can be overridden by subclasses.
   */
  createEvent(message: any, botId: string): BotEvent {
    return {
      id: crypto.randomUUID(),
      transport: this.type,
      type: "message" as BotEventType,
      botId,
      text: message.text || message.content || "",
      timestamp: new Date().toISOString(),
      rawMetadata: message.metadata || {},
    };
  }
}
