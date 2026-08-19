/**
 * TestTransport utilities for bot runtime testing.
 * 
 * Provides helper functions for common testing patterns:
 * - Sending messages through the transport
 * - Verifying event processing
 * - Simulating disconnect/reconnect cycles
 * - Testing session isolation
 */
import { TestTransport, BotEvent, BotEventType, BotAttachment } from "../types";

/** Helper: send a message through the test transport */
export function sendTestMessage(
  transport: TestTransport,
  type: BotEventType,
  text: string,
  attachments?: BotAttachment[]
): BotEvent {
  const event: BotEvent = {
    id: crypto.randomUUID(),
    transport: "test",
    type,
    botId: "test-bot",
    text,
    timestamp: new Date().toISOString(),
    attachments,
  };
  transport.emitIncoming(event);
  return event;
}

/** Helper: simulate a DM message */
export function simulateDm(transport: TestTransport, userId: string, text: string): BotEvent {
  return sendTestMessage(transport, "message", text, [
    {
      id: crypto.randomUUID(),
      name: "test.txt",
      contentType: "text/plain",
    },
  ]);
}

/** Helper: simulate a bot mention */
export function simulateMention(transport: TestTransport, botMention: string, text: string): BotEvent {
  return sendTestMessage(transport, "mention", text, []);
}

/** Helper: check if an event was already processed */
export function wasEventProcessed(
  transport: TestTransport,
  eventId: string
): boolean {
  return transport.getIncomingEvents().some(
    e => e.id === eventId
  );
}

/** Helper: get the most recent event of a given type */
export function getLastEventOfType(
  transport: TestTransport,
  type: BotEventType
): BotEvent | undefined {
  const events = transport.getIncomingEvents().filter(
    e => e.type === type
  );
  return events.length > 0 ? events[events.length - 1] : undefined;
}
