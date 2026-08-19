/**
 * Base Transport Implementation
 * 
 * Base class for transport implementations that provides
 * common functionality like event normalization and lifecycle.
 */
import { BotTransport, BotEvent, BotEventType, BotAttachment, OutboundBotMessage } from "./types";

export abstract class BaseTransport {
  readonly _type!: string;

  get type(): string {
    return this._type;
  }

  abstract start(): Promise<void>;

  abstract stop(): Promise<void>;

  abstract send(message: OutboundBotMessage): Promise<void>;

  /**
   * Normalize platform-specific event into a BotEvent
   */
  abstract normalizeEvent(event: any): BotEvent;

  /**
   * Create a bot event from a platform message
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