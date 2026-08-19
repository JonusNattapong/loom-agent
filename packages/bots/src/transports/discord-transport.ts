import {Client, GatewayIntentBits, Message, TextChannel, ThreadChannel} from "discord.js";
import type {BotEvent, BotTransport, OutboundBotMessage} from "../types.js";

export type DiscordLifecycle = "stopped" | "starting" | "connected" | "reconnecting" | "disconnected" | "failed";
export interface DiscordTransportOptions { tokenEnv?: string; clientFactory?: (options: ConstructorParameters<typeof Client>[0]) => Client; onEvent?: (event: BotEvent) => void | Promise<void>; onState?: (state: DiscordLifecycle) => void; }

/** Discord adapter; all Discord-specific behavior is contained here. */
export class DiscordTransport implements BotTransport {
  readonly type = "discord";
  private client: Client | undefined;
  private state: DiscordLifecycle = "stopped";
  private readonly tokenEnv: string;
  private readonly makeClient: NonNullable<DiscordTransportOptions["clientFactory"]>;
  private readonly onEvent?: DiscordTransportOptions["onEvent"];
  private readonly onState?: DiscordTransportOptions["onState"];
  constructor(options: DiscordTransportOptions = {}) {
    this.tokenEnv = options.tokenEnv ?? "DISCORD_BOT_TOKEN";
    this.makeClient = options.clientFactory ?? ((config) => new Client(config));
    this.onEvent = options.onEvent; this.onState = options.onState;
  }
  get lifecycle(): DiscordLifecycle { return this.state; }
  private setState(state: DiscordLifecycle) { this.state = state; this.onState?.(state); }
  async start(): Promise<void> {
    const token = process.env[this.tokenEnv];
    if (!token) throw new Error(`Missing environment variable: ${this.tokenEnv}`);
    if (this.client && this.state !== "stopped") return;
    this.setState("starting");
    const client = this.makeClient({intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});
    this.client = client;
    client.once("ready", () => this.setState("connected"));
    client.on("messageCreate", (message) => void this.handleMessage(message));
    client.on("shardDisconnect", () => this.setState("disconnected"));
    client.on("shardReconnecting", () => this.setState("reconnecting"));
    client.on("shardReady", () => this.setState("connected"));
    client.on("error", () => this.setState("failed"));
    await client.login(token);
  }
  async stop(): Promise<void> { if (!this.client) { this.setState("stopped"); return; } this.client.removeAllListeners(); this.client.destroy(); this.client = undefined; this.setState("stopped"); }
  async send(message: OutboundBotMessage): Promise<void> {
    if (!this.client || !this.client.isReady()) throw new Error("Discord transport is not connected");
    const channel = await this.client.channels.fetch(message.destination);
    if (!channel || !(channel.isTextBased())) throw new Error(`Discord channel is not text-based: ${message.destination}`);
    const content = (message.text ?? "").slice(0, 2000);
    await (channel as TextChannel | ThreadChannel).send({content});
  }
  /** Normalize a Discord message; bot-authored messages are deliberately ignored. */
  async handleMessage(message: Message): Promise<void> {
    if (message.author?.bot) return;
    const botId = this.client?.user?.id ?? "unknown";
    const mentioned = this.client?.user ? message.mentions.users.has(this.client.user.id) : false;
    const event: BotEvent = {id: message.id, transport: "discord", type: mentioned ? "mention" : "message", botId, workspaceId: message.guildId ?? undefined, channelId: message.channelId, threadId: message.channel?.isThread() ? message.channelId : undefined, userId: message.author.id, text: message.content, attachments: [...message.attachments.values()].map(a => ({id:a.id,name:a.name ?? a.id,contentType:a.contentType ?? undefined,size:a.size,url:a.url})), timestamp: message.createdAt.toISOString(), rawMetadata: {discordMessageId: message.id}};
    await this.onEvent?.(event);
  }
}
