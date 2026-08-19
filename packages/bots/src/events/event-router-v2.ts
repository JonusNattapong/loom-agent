/**
 * Event Router V0.5.1 - Enhanced
 * 
 * Implements routing rules for bot events with approval awareness.
 */
import { BotEvent, BotEventType } from "../types";

export interface RoutingPolicy {
  /** Respond to DM messages */
  respondToDM: boolean;
  /** Respond to bot mentions */
  respondToMention: boolean;
  /** Respond to all messages (default: false) */
  respondToAllMessages: boolean;
  /** Command handler function */
  commandHandler?: (event: BotEvent) => boolean;
  /** Authorization check */
  authorize: (userId: string, action: string) => boolean;
}

/** @deprecated Use EventGateway instead */
export class EventRouter {
  private readonly policy: RoutingPolicy;

  constructor(policy: RoutingPolicy) {
    this.policy = policy;
  }

  /**
   * Route a bot event based on type and policy.
   * @deprecated Use EventGateway.processEvent() instead
   */
  route(event: BotEvent): "respond" | "ignore" | "delegate" {
    // DM messages
    if (event.type === "message" && event.channelId === undefined) {
      return this.policy.respondToDM ? "respond" : "ignore";
    }

    // Bot mentions
    if (event.type === "mention") {
      return this.policy.respondToMention ? "respond" : "ignore";
    }

    // Explicit commands
    if (event.type === "command") {
      if (this.policy.commandHandler) {
        return this.policy.commandHandler(event) ? "respond" : "ignore";
      }
      return "respond"; // Default: try to handle
    }

    // Normal messages
    if (this.policy.respondToAllMessages) {
      return "respond";
    }

    return "ignore";
  }
}
