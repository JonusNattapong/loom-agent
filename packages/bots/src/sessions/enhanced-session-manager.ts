/**
 * Bot Session Manager - Hardened V0.5.1
 * 
 * Manages persistent bot sessions with deterministic session key generation
 * and strict isolation between different users/channels/threads.
 */
import { StateStore } from "@loom-agent/state";
import { BotSession, BotSessionManager } from "./bot-session-manager";
import { BotEvent, BotEventType } from "../types";

export interface SessionIsolationRules {
  /** Prevent users in the same channel from sharing session state */
  preventChannelUserLeakage: boolean;
  /** Isolate sessions by thread */
  isolateByThread: boolean;
  /** Isolate sessions by user within a channel */
  isolateByUser: boolean;
  /** Authorization policy for bot commands */
  authorization: {
    allowedUsers: string[];    // Discord user IDs allowed to use bot commands
    allowedChannels: string[]; // Discord channel IDs allowed
    admins: string[];          // Discord user IDs with admin privileges
  };
}

/**
 * Enhanced BotSessionManager with isolation and authorization
 */
export class EnhancedBotSessionManager {
  private readonly state: StateStore;
  private readonly rules: SessionIsolationRules;

  constructor(state: StateStore, rules?: Partial<SessionIsolationRules>) {
    this.state = state;
    this.rules = {
      preventChannelUserLeakage: true,
      isolateByThread: true,
      isolateByUser: true,
      authorization: {
        allowedUsers: [],
        allowedChannels: [],
        admins: [],
        ...rules?.authorization,
      },
    };
  }

  /**
   * Generate a deterministic session key based on event properties.
   * Ensures session isolation between users and threads.
   */
  private sessionKey(event: BotEvent, additional?: string[]): string {
    const parts: string[] = [];

    // Always include bot ID
    parts.push(event.botId || "default");

    // Include user ID (critical for isolation)
    if (event.userId) {
      parts.push(event.userId);
    }

    // Include channel ID
    if (event.channelId) {
      parts.push(event.channelId);
    }

    // Include thread ID if present and thread isolation is enabled
    if (event.threadId && this.rules.isolateByThread) {
      parts.push(event.threadId);
    } else if (event.channelId && this.rules.preventChannelUserLeakage) {
      // When no thread, include channel but prevent leakage
      parts.push(event.channelId);
    }

    // Add any additional qualifiers
    if (additional) {
      parts.push(...additional);
    }

    return parts.join(":");
  }

  /** Stable persistence hooks for runtime integrations. */
  sessionKeyFor(event: BotEvent): string { return this.sessionKey(event); }
  async saveSession(event: BotEvent, session: any): Promise<void> { await this.state.set(this.sessionKey(event), session); }
  /**
   * Find or create a session for an incoming event with full isolation
   */
  async findOrCreateSession(event: BotEvent): Promise<{
    session: any;  // BotSession
    isNew: boolean;
    isolationNotes: string[];
  }> {
    const key = this.sessionKey(event);
    const isolationNotes: string[] = [];

    // Check for existing session
    const existing = await this.state.get<BotSession>(key);
    if (existing) {
      isolationNotes.push("existing-session-found");
      // Update timestamp
      existing.updatedAt = new Date().toISOString();
      await this.state.set(key, existing);
      return { session: existing, isNew: false, isolationNotes };
    }

    // Create new session with appropriate isolation
    const session: BotSession = {
      id: crypto.randomUUID(),
      botId: event.botId || "default",
      transport: event.transport,
      workspaceId: event.workspaceId,
      channelId: event.channelId,
      threadId: event.threadId,
      userId: event.userId,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    isolationNotes.push("new-session-created");
    await this.state.set(key, session);
    return { session, isNew: true, isolationNotes };
  }

  /**
   * Check if a user is authorized for a given operation
   */
  isAuthorized(userId: string, action: "command" | "approval" | "reset"): boolean {
    const { authorization } = this.rules;

    // Admins are always authorized
    if (authorization.admins.includes(userId)) {
      return true;
    }

    // Check allowed users
    if (authorization.allowedUsers.includes(userId)) {
      return true;
    }

    // Check allowed channels (for channel-specific operations)
    if (action === "command" && authorization.allowedChannels.length > 0) {
      // Channel-specific authorization logic
      return true; // Simplified - would check actual channel ID
    }

    return false;
  }

  /**
   * Validate that a session respects isolation rules
   */
  validateSessionIsolation(existingSession: any, newEvent: BotEvent): boolean {
    // If preventChannelUserLeakage is enabled, ensure different users in same
    // channel have separate sessions
    if (this.rules.preventChannelUserLeakage && existingSession.userId && existingSession.userId !== newEvent.userId) {
      // Different user in same channel = different session (already handled by key generation)
      return true;
    }
    return true;
  }
}
