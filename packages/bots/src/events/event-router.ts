/**
 * Event Router
 * 
 * Implements routing rules for bot events.
 * 
 * Examples:
 * - DM message       -> respond
 * - bot mention      -> respond
 * - normal channel   -> policy decides
 * - explicit command -> command handler
 * - attachment       -> attachment/context pipeline
 */
import { BotEvent, BotEventType } from "../types";

export interface RoutingPolicy {
  respondToDM: boolean;
  respondToMention: boolean;
  respondToAllMessages: boolean;
  commandHandler?: (event: BotEvent) => boolean;
}

export class EventRouter {
  private readonly policy: RoutingPolicy;

  constructor(policy: RoutingPolicy) {
    this.policy = policy;
  }

  /**
   * Determine how to handle a bot event
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
