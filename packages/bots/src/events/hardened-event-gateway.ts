/**
 * Event Gateway V0.5.1 - Hardened
 * 
 * Responsibilities:
 * - receive event
 * - normalize
 * - validate (authorization, deduplication)
 * - deduplicate
 * - route (with approval awareness)
 * - trace
 * - acknowledge
 */
import { StateStore } from "@loom-agent/state";
import { EnhancedBotSessionManager } from "../sessions/enhanced-session-manager";
import { EventDedup } from "./dedup-store";
import { BotEvent, BotEventType, BotEventType as DiscordEventType } from "../types";
import { OutboundBotMessage } from "../types";

export interface AdaptiveBotRunner { run(input:{goal:string;session:any;rootAgentId?:string}):Promise<{rootAgentId:string;status:string;response:string}>; }

export interface EventProcessingResult {
  status: "received" | "ignored" | "handled" | "approval-required" | "denied";
  session?: any;
  approvalId?: string;
  decisions: Record<string, boolean>;
  response?: string;
}

export class EventGateway {
  private readonly state: StateStore;
  private readonly sessionManager: EnhancedBotSessionManager;
  private readonly dedup: EventDedup;
  private readonly adaptive?: AdaptiveBotRunner;

  constructor(state: StateStore, sessionManager?: EnhancedBotSessionManager, adaptive?: AdaptiveBotRunner) {
    this.state = state;
    this.sessionManager = sessionManager || new EnhancedBotSessionManager(state);
    this.dedup = new EventDedup(state);
    this.adaptive = adaptive;
  }

  /**
   * Process an incoming bot event through the full pipeline.
   * Returns a result indicating the disposition of the event.
   */
  async processEvent(event: BotEvent): Promise<EventProcessingResult> {
    const decisions: Record<string, boolean> = {};

    // Step 1: Check for duplicates (idempotency)
    const isDuplicate = await this.dedup.isDuplicate(
      event.transport,
      event.id,
      event.botId
    );
    decisions['deduplication'] = !isDuplicate;

    if (isDuplicate) {
      return {
        status: "ignored",
        decisions,
        session: await this.sessionManager.state.get(
          this.sessionManager.sessionKey(event)
        ),
      };
    }

    // Step 2: Persist the event
    await this.dedup.markReceived(
      event.transport,
      event.id,
      event.botId
    );
    decisions['persistence'] = true;

    // Step 3: Authorization check
    const userAuthorized = this.sessionManager.isAuthorized(
      event.userId || "",
      "command"
    );
    decisions['authorization'] = userAuthorized;

    if (!userAuthorized) {
      return {
        status: "denied",
        decisions,
        session: await this.sessionManager.state.get(
          this.sessionManager.sessionKey(event)
        ),
      };
    }

    // Step 4: Session resolution
    const sessionResult = await this.sessionManager.findOrCreateSession(event);
    decisions['session-resolution'] = true;

    // Step 5: Route the event based on type and policy
    const routingDecision = this.routeEvent(event);
    decisions['routing'] = routingDecision.status !== "ignore";

    if (routingDecision.status === "ignore") {
      return {
        status: "ignored",
        decisions,
        session: routingDecision.session,
      };
    }

    // Step 6: Check if approval is required
    const requiresApproval = this.checkApprovalRequirement(event);
    decisions['approval-required'] = requiresApproval;

    if (requiresApproval) {
      return {
        status: "approval-required",
        session: routingDecision.session,
        approvalId: routingDecision.approvalId,
        decisions,
      };
    }

    // Step 7: Execute the same adaptive pipeline used by CLI/runtime when configured.
    let response: string | undefined;
    if (this.adaptive) {
      const session = sessionResult.session as any;
      const run = await this.adaptive.run({goal:event.text??"",session,rootAgentId:session.rootAgentId});
      session.rootAgentId = run.rootAgentId;
      session.updatedAt = new Date().toISOString();
      await this.sessionManager.saveSession(event, session);
      response = run.response;
      decisions['adaptive-planner'] = true;
      decisions['verified'] = run.status === "completed";
    }
    await this.dedup.markHandled(event.transport,event.id,event.botId);
    decisions['handled'] = true;
    return {status:"handled",session:sessionResult.session,decisions,response};
  }

  /**
   * Determine how to route a bot event based on type and policy.
   */
  private routeEvent(event: BotEvent): {
    status: "respond" | "ignore" | "delegate";
    session: any;
    approvalId?: string;
  } {
    const { authorization } = this.sessionManager.rules;

    // DM messages
    if (event.type === "message" && event.channelId === undefined) {
      // DMs are always responded to unless explicitly configured otherwise
      return { status: "respond", session: {} };
    }

    // Bot mentions
    if (event.type === "mention") {
      return { status: "respond", session: {} };
    }

    // Explicit commands
    if (event.type === "command") {
      const command = (event as any).command || "";
      // Check if this is an authorized command
      if (command.startsWith("/")) {
        // Command requires authorization check
        const isAuth = this.sessionManager.isAuthorized(
          event.userId || "",
          "command"
        );
        if (!isAuth) {
          return { status: "ignore", session: {}, approvalId: undefined };
        }
      }
      // Check if there's a command handler
      if (event.rawMetadata?.commandHandler) {
        const handled = event.rawMetadata.commandHandler(event);
        if (handled) {
          return { status: "respond", session: {} };
        }
      }
      // Default: respond to commands
      return { status: "respond", session: {} };
    }

    // Normal channel messages - check policy
    const shouldRespond = 
      event.rawMetadata?.shouldRespond !== false;

    if (shouldRespond) {
      return { status: "respond", session: {} };
    }

    return { status: "ignore", session: {} };
  }

  /**
   * Check if an event requires approval based on its nature.
   */
  private checkApprovalRequirement(event: BotEvent): boolean {
    // Tool calls that modify state require approval
    if (event.type === "message" && event.attachments?.length > 0) {
      // Attachments may require approval
      const hasRestrictedAttachment = event.attachments.some(
        a => a.contentType && !a.contentType.startsWith("text/")
      );
      if (hasRestrictedAttachment) {
        return true;
      }
    }

    // Commands that modify state
    if (event.type === "command") {
      const command = (event as any).command || "";
      // Restricted commands require approval
      const restrictedCommands = ["/shutdown", "/reset", "/configure"];
      if (restrictedCommands.includes(command.toLowerCase())) {
        return true;
      }
    }

    return false;
  }
}
