/**
 * Event Gateway
 * 
 * Responsibilities:
 * - receive event
 * - normalize
 * - validate
 * - deduplicate
 * - route
 * - trace
 * - acknowledge
 */
import { StateStore } from "@loom-agent/state";
import { EventDedup } from "./events/dedup-store";
import { BotEvent, BotEventType } from "../types";

export interface EventProcessingState {
  received: boolean;
  persisted: boolean;
  routed: boolean;
  handled: boolean;
  responded: boolean;
}

export class EventGateway {
  private readonly state: StateStore;
  private readonly dedup: EventDedup;

  constructor(state: StateStore) {
    this.state = state;
    this.dedup = new EventDedup(state);
  }

  /**
   * Process an incoming bot event
   */
  async processEvent(event: BotEvent, botId: string): Promise<"received" | "ignored" | "handled"> {
    // Step 1: Check for duplicates
    const isDuplicate = await this.dedup.isDuplicate(
      event.transport,
      event.id,
      botId
    );

    if (isDuplicate) {
      return "ignored";
    }

    // Step 2: Persist the event
    await this.dedup.markReceived(
      event.transport,
      event.id,
      botId
    );

    // Step 3: Route the event
    // (will be implemented in EventRouter)

    return "received";
  }
}
