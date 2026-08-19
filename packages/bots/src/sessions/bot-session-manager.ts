/**
 * Persistent Bot Session
 * 
 * Represents continuity between an external conversation context and Loom.
 * Persisted in SQLite for crash recovery and resume.
 */
import { StateStore } from "@loom/state";

export interface BotSession {
  id: string;
  botId: string;
  transport: string;
  workspaceId?: string;
  channelId?: string;
  threadId?: string;
  userId?: string;
  rootAgentId?: string;
  status: "active" | "idle" | "closed";
  createdAt: string;
  updatedAt: string;
}

export class BotSessionManager {
  private readonly store: StateStore;

  constructor(state: StateStore) {
    this.store = state;
  }

  /**
   * Find or create a session for an incoming event
   */
  async findOrCreateSession(event: any, botId: string): Promise<BotSession> {
    // Determine session key based on event properties
    const key = this.sessionKey(event);

    // Try to find existing session
    const existing = await this.store.get<BotSession>(key);
    if (existing) {
      // Update timestamp
      existing.updatedAt = new Date().toISOString();
      await this.store.set(key, existing);
      return existing;
    }

    // Create new session
    const session: BotSession = {
      id: crypto.randomUUID(),
      botId,
      transport: event.transport,
      workspaceId: event.workspaceId,
      channelId: event.channelId,
      threadId: event.threadId,
      userId: event.userId,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.store.set(key, session);
    return session;
  }

  /**
   * Get the session key based on event properties
   */
  private sessionKey(event: any): string {
    // Discord DM: bot + user
    // Discord thread: bot + channel + thread
    // Default: bot + channel + user
    const parts = [event.botId || ""];
    if (event.userId) parts.push(event.userId);
    if (event.channelId) parts.push(event.channelId);
    if (event.threadId) parts.push(event.threadId);
    return parts.join(":");
  }

  /**
   * Update session status
   */
  async updateSession(sessionId: string, updates: Partial<BotSession>): Promise<void> {
    const key = sessionId;
    const existing = await this.store.get<BotSession>(key);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      await this.store.set(key, updated);
    }
  }
}
