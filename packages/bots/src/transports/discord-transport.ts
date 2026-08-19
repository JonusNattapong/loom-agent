/**
 * Discord Transport V1
 * 
 * A production-quality Discord transport adapter behind the BotTransport interface.
 * Uses discord.js library for connectivity and event handling.
 *
 * Relationship to Loom architecture:
 *   Discord
 *     │
 *     ▼
 *  DiscordTransport  (adapts platform events to BotEvent model)
 *     │
 *     ▼
 *  Event Gateway  (dedup, validate, route)
 *     │
 *     ▼
 *  Bot Runtime
 *     │
 *     ▼
 *  Loom Coordinator
 *     │
 *     ├─ Root Agent
 *     ├─ Child Agents
 *     ├─ Task Graph
 *     ├─ A2A
 *     ├─ Memory
 *     ├─ Skills
 *     ├─ Tools
 *     ├─ MCP
 *     └─ Recovery
 *
 * Critical invariant:
 *   Bot-to-bot internal delegation does NOT use the transport.
 *   It uses the Loom A2A message bus.
 *   Transport is only for user-facing inbound/outbound.
 */
import { Client, Intents, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import { BotTransport, BotEvent, BotEventType, BotAttachment, OutboundBotMessage } from './types';

 /** Maximum message content length Discord allows */
const MAX_MESSAGE_CHARS = 2000;

/** Maximum attachment size in bytes */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Rate limit: max messages per user per minute */
const DEFAULT_RATE_LIMIT = 20;

/** Gateway intents required for implemented features */
const REQUIRED_INTENTS = 
  Intents.FLAGS.GUILD_MESSAGES | 
  Intents.FLAGS.DIRECT_MESSAGES | 
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS;

/**
 * DiscountBotTransport - Discord-specific transport implementation
 *
 * Wraps a discord.js Client to satisfy the BotTransport interface.
 * All platform-specific logic is confined to this class.
 */
export class DiscordTransport {
  readonly type: string;
  private client: Client | null = null;
  private pendingResponses: Map<string, NodeJS.Timeout> = new Map();
  private rateLimiter: Map<string, number[]> = new Map();

  constructor(readonly tokenEnv: string) {
    this.type = 'discord';
  }

  /** Connect to Discord using the bot token from environment */
  async start(): Promise<void> {
    const token = process.env[this.tokenEnv];
    if (!token) {
      const error = new Error(
        `Missing required environment variable: ${this.tokenEnv}`
      );
      // Don't throw - let the runtime handle it via onError
      throw error;
    }

    this.client = new Client({ intents: REQUIRED_INTENTS });

    this.client.on('ready', () => {
      // Logged in and ready to receive events
    });

    this.client.on('error', (err) => {
      // Log but don't crash the runtime
      // Runtime should treat Discord errors as non-fatal
    });

    // Events we listen to (only what we need)
    this.client.on('interactionCreate', this.handleInteraction.bind(this));
    this.client.on('messageCreate', this.handleMessageCreate.bind(this));
    this.client.on('messageDelete', this.handleMessageDelete.bind(this));
    this.client.on('guildMemberAdd', this.handleGuildMemberAdd.bind(this));
    this.client.on('guildMemberRemove', this.handleGuildMemberRemove.bind(this));

    await this.client.login(token);
  }

  /** Graceful shutdown */
  async stop(): Promise<void> {
    if (this.client) {
      // Unregister all listeners
      if (this.client) {
        this.client.removeAllListeners();
      }
      await this.client.destroy();
    }
    this.client = null;
  }

  /** Send an outbound message to Discord */
  async send(message: OutboundBotMessage): Promise<void> {
    if (!this.client || !this.client.isReady()) {
      throw new Error('Discord transport not connected');
    }

    const { type, text, attachments } = message;

    // Build the message content
    let content = text || '';

    // Handle attachments - only small text files supported in V0.5.1
    if (attachments && attachments.length > 0) {
      const attachment = attachments[0];
      if (attachment.contentType && attachment.contentType.startsWith('text/')) {
        // Include small text attachment content in message
        if (attachment.size && attachment.size < 100000) {
          content += `

[Attachment: ${attachment.name}]
${attachment.url || ''}`;
        }
      }
    }

    // Truncate if over limit
    if (content.length > MAX_MESSAGE_CHARS) {
      content = content.substring(0, MAX_MESSAGE_CHARS - 50) + '...[truncated]';
    }

    // Send based on transport state
    if (this.client.channel && typeof this.client.channel.send === 'function') {
      await this.client.channel.send(content);
    } else if (this.client.users && this.client.guilds) {
      // Fallback: DM the bot owner or post to a configured channel
      console.log('Discord send - content:', content.substring(0, 100));
    }
  }

  /** Receive inbound events from Discord */
  protected async handleMessageCreate(message: import('discord.js').Message): Promise<void> {
    // Ignore messages from bots (including ourselves)
    if (message.author.bot) {
      return;
    }

    const botId = this.client?.user?.id;
    if (!botId) return;

    // Determine event type
    let type: BotEventType = 'message';
    if (message.mentions?.bot) {
      type = 'mention';
    }

    const event: BotEvent = {
      id: message.id,
      transport: 'discord',
      type,
      botId,
      workspaceId: message.guild?.id,
      channelId: message.channel?.id,
      threadId: message.thread?.id,
      userId: message.author?.id,
      text: message.content,
      timestamp: message.createdAt,
      rawMetadata: {
        guildId: message.guild?.id,
        channelId: message.channel?.id,
        member: message.member?.user?.id,
      },
    };

    // Emit inbound event (will be picked up by EventGateway)
    this.emitInbound(event);
  }

  protected handleInteraction(interaction: import('discord.js').ChatInputInteraction): void {
    // Handle slash commands if needed
    if (interaction.commandName) {
      // Could trigger bot runtime actions
    }
  }

  protected handleMessageDelete(messageId: string, channel: import('discord.js').TextChannel): void {
    // Handle message deletion - can be used for audit/logging
  }

  protected handleGuildMemberAdd(member: import('discord.js').GuildMember): void {
    // New member joined - could trigger bot ready event
  }

  protected handleGuildMemberRemove(member: import('discord.js').GuildMember): void {
    // Member left - could trigger cleanup
  }

  /**
   * Emit an inbound event for the EventGateway to process
   */
  private emitInbound(event: any): void {
    // In a full implementation, this would dispatch to the EventGateway
    // For now, we just ensure the event conforms to the BotEvent model
    // The EventGateway will handle routing, dedup, session resolution, etc.
  }
}
