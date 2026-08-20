/**
 * Event Deduplication Store
 * 
 * Persists processed events to prevent duplicate processing
 * after restarts or redeliveries.
 */
import { StateStore } from "@loom-agent/state";

export interface DedupRecord {
  transport: string;
  external_event_id: string;
  bot_id: string;
  processing_status: "received" | "processing" | "handled" | "failed" | "ignored";
  received_at: string;
  processed_at?: string;
}

export class EventDedup {
  private readonly store: StateStore;

  constructor(state: StateStore) {
    this.store = state;
  }

  /**
   * Check if an event has already been processed
   */
  async isDuplicate(transport: string, external_event_id: string, botId: string): Promise<boolean> {
    const key = `${transport}:${external_event_id}:${botId}`;
    const record = await this.store.get<DedupRecord>(key);
    return record !== undefined && record.processing_status === "handled";
  }

  /**
   * Mark an event as received
   */
  async markReceived(transport: string, external_event_id: string, botId: string): Promise<void> {
    const key = `${transport}:${external_event_id}:${botId}`;
    const record: DedupRecord = {
      transport,
      external_event_id,
      botId,
      processing_status: "received",
      received_at: new Date().toISOString(),
    };
    await this.store.set(key, record);
  }

  /**
   * Mark an event as handled
   */
  async markHandled(transport: string, external_event_id: string, botId: string): Promise<void> {
    const key = `${transport}:${external_event_id}:${botId}`;
    const record: DedupRecord = {
      transport,
      external_event_id,
      botId,
      processing_status: "handled",
      processed_at: new Date().toISOString(),
    };
    await this.store.set(key, record);
  }

  /**
   * Mark an event as failed
   */
  async markFailed(transport: string, external_event_id: string, botId: string, error: string): Promise<void> {
    const key = `${transport}:${external_event_id}:${botId}`;
    const record: DedupRecord = {
      transport,
      external_event_id,
      botId,
      processing_status: "failed",
    };
    await this.store.set(key, record);
  }
}
