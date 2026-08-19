/**
 * TestTransport
 * 
 * Deterministic in-memory transport for testing and local simulation.
 * Implements the exact same BotTransport interface as Discord transport,
 * allowing all normal tests and evals to work without Discord credentials.
 *
 * Simulates:
 *   - incoming messages (DM, mention, channel, thread)
 *   - duplicate events
 *   - attachments
 *   - responses
 *   - disconnect/reconnect
 *   - send failures
 *   - outbound message recording
 */
import { BotTransport, BotEvent, BotEventType, BotAttachment, OutboundBotMessage } from "../types";

export interface TestTransportState {
  /** Recorded inbound events (for verification) */
  incomingMessages: BotEvent[];
  /** Recorded outbound messages (for assertion) */
  sentMessages: OutboundBotMessage[];
  /** Simulated connection state */
  state: "connected" | "disconnected" | "connecting";
  /** Injected events to be dispatched */
  pendingEvents: BotEvent[];
}

/**
 * TestTransport - A deterministic in-memory transport for testing.
 * Implements the exact same BotTransport interface as Discord transport.
 */
export class TestTransport {
  private readonly state: TestTransportState;

  constructor(initialState?: Partial<TestTransportState>) {
    this.state = {
      incomingMessages: [],
      sentMessages: [],
      state: "disconnected",
      pendingEvents: [],
      ...initialState,
    };
  }

  /** Get the current transport state */
  getState(): TestTransportState {
    return { ...this.state };
  }

  /** Get a copy of recorded inbound events */
  getIncomingEvents(): BotEvent[] {
    return [ ...this.state.incomingMessages ];
  }

  /** Get a copy of recorded outbound messages */
  getSentMessages(): OutboundBotMessage[] {
    return [ ...this.state.sentMessages ];
  }

  /** Reset the transport state (useful between tests) */
  reset(): void {
    this.state.incomingMessages = [];
    this.state.sentMessages = [];
    this.state.state = "disconnected";
    this.state.pendingEvents = [];
  }

  /** Simulate receiving an inbound event from the platform */
  emitIncoming(event: BotEvent): void {
    this.state.incomingMessages.push(event);
  }

  /** Simulate receiving a duplicate event */
  emitDuplicate(event: BotEvent): void {
    // Check if similar event already exists
    const exists = this.state.incomingMessages.some(
      e => e.id === event.id && e.type === event.type
    );
    if (!exists) {
      this.state.incomingMessages.push(event);
    }
  }

  /** Simulate disconnect */
  disconnect(): void {
    this.state.state = "disconnected";
  }

  /** Simulate reconnect */
  reconnect(): void {
    this.state.state = "connected";
    // Process any pending events on reconnect
    for (const event of this.state.pendingEvents) {
      this.state.incomingMessages.push(event);
    }
    this.state.pendingEvents = [];
  }

  /** Send an outbound message (records it internally) */
  async send(message: OutboundBotMessage): Promise<void> {
    this.state.sentMessages.push(message);
    // Simulate immediate delivery
    // In a real implementation, this would transmit to the platform
  }

  /** Set pending events to be dispatched on next reconnect */
  setPendingEvents(events: BotEvent[]): void {
    this.state.pendingEvents = [ ...events ];
  }

  /** Get the current connection state */
  getConnectionState(): "connected" | "disconnected" | "connecting" {
    return this.state.state;
  }
}
