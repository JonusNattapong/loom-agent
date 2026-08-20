/**
 * @loom/sdk — Public developer SDK for Loom V1.0.
 *
 * The SDK is a stable facade over the existing durable Loom runtime. It does
 * NOT introduce a second runtime: createLoomApp composes StateStore, AgentLoop,
 * the tool/skill runtimes, the adaptive orchestrator, the daemon, and the
 * control plane exactly as the CLI already does.
 *
 * Stability:
 *  - Stable exports follow the 1.x compatibility policy (see README).
 *  - @experimental exports may change within minor releases.
 */
import {EventEmitter} from "node:events";
import {randomUUID} from "node:crypto";
import type {
  Agent,
  AgentRole,
  Provider,
  Tool,
  PermissionLevel,
} from "@loom/core";
import {StateStore} from "@loom/state";
import {ToolRegistry, createNativeTools, type ToolPolicy} from "@loom/tools";
import {SkillRuntime} from "@loom/skills";
import {MockProvider, OpenAICompatibleProvider} from "@loom/providers";

import {
  SDK_API_VERSION,
  PROTOCOL_MAJOR,
  SCHEMA_VERSION,
  type AgentDefinition,
  type SdkToolDefinition,
  type SdkSkillDefinition,
  type BotDefinition,
  type LoomEvent,
  type LoomAppManifest,
  type LoomPolicy,
  type ToolContext,
} from "./contracts.js";

export * from "./contracts.js";
export * from "./world.js";
export * from "./client.js";

export interface DefineAgentInput {
  id: string;
  role?: AgentRole;
  provider?: string;
  model?: string;
  system?: string;
  goal?: string;
  maxRounds?: number;
  tools?: string[];
  skills?: string[];
  execution?: AgentDefinition["execution"];
}

export function defineAgent(input: DefineAgentInput): AgentDefinition {
  if (!input.id || typeof input.id !== "string") {
    throw new Error("defineAgent requires a non-empty string id");
  }
  const {id, ...rest} = input;
  return {id, ...rest};
}

export function defineTool(input: SdkToolDefinition): SdkToolDefinition {
  if (!input.name || typeof input.name !== "string") {
    throw new Error("defineTool requires a non-empty string name");
  }
  if (typeof input.execute !== "function") {
    throw new Error(`defineTool("${input.name}") requires an execute function`);
  }
  return {...input};
}

export function defineSkill(input: SdkSkillDefinition): SdkSkillDefinition {
  if (!input.name || typeof input.name !== "string") {
    throw new Error("defineSkill requires a non-empty string name");
  }
  return {...input};
}

export function defineBot(input: BotDefinition): BotDefinition {
  if (!input.id || !input.agent || !input.transport) {
    throw new Error("defineBot requires id, agent, and transport");
  }
  return {...input};
}

/** Options accepted by createLoomApp. */
export interface LoomAppOptions {
  name?: string;
  schemaVersion?: number;
  manifest?: LoomAppManifest;
  agents?: AgentDefinition[];
  tools?: SdkToolDefinition[];
  skills?: SdkSkillDefinition[];
  bots?: BotDefinition[];
  provider?: Provider | {id: string; model?: string; apiKeyEnv?: string};
  policy?: LoomPolicy;
  workspace?: string;
  dbPath?: string;
  maxRounds?: number;
  maxConcurrent?: number;
  controlPlane?: import("@loom/control").ControlOptions;
  daemon?: Partial<import("@loom/daemon").DaemonOptions>;
}

export interface LoomAppRunOptions {
  goal: string;
  agent?: string;
  maxRounds?: number;
  skills?: string[];
}

export type LoomAppEvent = LoomEvent;

/**
 * High-level Loom application. Composes the existing durable runtime and
 * exposes stable lifecycle, extension, and event APIs.
 */
export class LoomApp {
  readonly name: string;
  readonly state: StateStore;
  readonly events = new EventEmitter();
  private readonly workspace: string;
  private readonly providers = new Map<string, Provider>();
  private readonly registry: ToolRegistry;
  private readonly skills: SkillRuntime;
  private readonly agentDefs = new Map<string, AgentDefinition>();
  private readonly sdkTools = new Map<string, SdkToolDefinition>();
  private readonly sdkSkills = new Map<string, SdkSkillDefinition>();
  private readonly bots: BotDefinition[] = [];
  private policy: LoomPolicy;
  private provider: Provider;
  private daemon?: import("@loom/daemon").Daemon;
  private control?: {service: import("@loom/control").ControlPlaneService; server: import("@loom/control").ControlServer};
  private optionsControl?: import("@loom/control").ControlOptions;
  private daemonOpts?: Partial<import("@loom/daemon").DaemonOptions>;
  private maxConcurrent = 2;

  constructor(options: LoomAppOptions = {}) {
    this.name = options.name ?? options.manifest?.name ?? "loom-app";
    if (options.schemaVersion !== undefined && options.schemaVersion !== 1) {
      throw new Error(`Unsupported LoomApp schemaVersion: ${options.schemaVersion}. V1.0 supports schemaVersion 1.`);
    }
    this.workspace = options.workspace ?? process.cwd();
    this.state = new StateStore(options.dbPath ?? ":memory:");
    this.registry = createNativeTools(this.workspace);
    this.skills = new SkillRuntime();
    this.policy = options.policy ?? options.manifest?.policy ?? {};
    this.provider = resolveProvider(options.provider);
    this.registerProvider(this.provider);

    for (const a of options.agents ?? options.manifest?.agents ?? []) {
      if (typeof a === "string") continue;
      this.agentDefs.set(a.id, a);
    }
    for (const t of options.tools ?? options.manifest?.tools ?? []) {
      if (typeof t === "string") continue;
      this.registerTool(t);
    }
    for (const s of options.skills ?? options.manifest?.skills ?? []) {
      if (typeof s === "string") continue;
      this.registerSkill(s);
    }
    for (const b of options.bots ?? options.manifest?.bots ?? []) {
      this.bots.push(b);
    }
    this.events.setMaxListeners(0);
  }

  /** Register an extension provider. Provider IDs must be unique. */
  registerProvider(provider: Provider): this {
    if (this.providers.has(provider.name)) {
      throw new Error(`provider id collision: ${provider.name}`);
    }
    this.providers.set(provider.name, provider);
    return this;
  }

  /** Register an extension tool. Tools run through ToolExecutor (permissions, approval, idempotency, tracing). */
  registerTool(tool: SdkToolDefinition): this {
    if (this.sdkTools.has(tool.name)) {
      throw new Error(`tool name collision: ${tool.name}`);
    }
    this.sdkTools.set(tool.name, tool);
    const wrapped: Tool = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input: Record<string, unknown>) => {
        const ctx: ToolContext = {
          workspace: this.workspace,
          emit: (type, data) => this.state.addTrace("sdk-tool", type, data),
        };
        return tool.execute(input, ctx);
      },
    };
    this.registry.register(wrapped);
    return this;
  }

  /** Register an extension skill. */
  registerSkill(skill: SdkSkillDefinition): this {
    if (this.sdkSkills.has(skill.name)) {
      throw new Error(`skill id collision: ${skill.name}`);
    }
    this.sdkSkills.set(skill.name, skill);
    return this;
  }

  /** Register a bot adapter. */
  registerBotAdapter(bot: BotDefinition): this {
    this.bots.push(bot);
    return this;
  }

  getProvider(id?: string): Provider {
    if (id) {
      const p = this.providers.get(id);
      if (!p) throw new Error(`unknown provider: ${id}`);
      return p;
    }
    return this.provider;
  }

  /** Run a goal using the embedded (in-process) runtime. Does not require the daemon. */
  async run(options: LoomAppRunOptions): Promise<Agent> {
    const {AgentLoop} = await import("@loom/runtime");
    const {ContextCompiler} = await import("@loom/context");
    const agentId = this.agentDefs.get(options.agent ?? "main")?.id ?? options.agent ?? "main";
    const def = this.agentDefs.get(agentId);
    const provider = this.getProvider(def?.provider);
    const loop = new AgentLoop(this.state, provider, this.registry, {
      system: def?.system,
      skills: this.skills,
      selectedSkills: options.skills ?? def?.skills,
      toolPolicy: this.buildToolPolicy(),
      context: new ContextCompiler(),
      maxChars: 8000,
    });
    const agent = this.state.createAgentRecord({
      goal: options.goal,
      role: def?.role ?? "planner",
      rootAgentId: agentId,
    });
    this.emitEvent({eventVersion: 1, type: "agent.started", agentId: agent.id, role: def?.role, goal: options.goal, at: Date.now()});
    try {
      const result = await loop.run(options.goal, agent.id);
      this.emitEvent({eventVersion: 1, type: "agent.completed", agentId: agent.id, status: result.status, result: result.result, at: Date.now()});
      return result;
    } catch (error) {
      this.emitEvent({eventVersion: 1, type: "agent.completed", agentId: agent.id, status: "failed", at: Date.now()});
      throw error;
    }
  }

  /** Start the durable daemon + control plane (background mode). */
  async start(): Promise<{daemonId: string; controlUrl?: string}> {
    if (this.daemon) return {daemonId: this.daemon.daemonId};
    const {Daemon} = await import("@loom/daemon");
    const {AdaptiveOrchestrator} = await import("@loom/adaptive");
    const runner: import("@loom/daemon").JobRunner = {
      run: async (job: any) => {
        const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
        const root = job.rootAgentId ?? this.state.createAgentRecord({goal: payload.goal, role: "planner"}).id;
        if (!job.rootAgentId) this.state.updateJob(job.id, "claimed", {rootAgentId: root});
        const plan = await new AdaptiveOrchestrator(this.state, this.provider).run(root, payload.goal);
        const agent = this.state.getAgent(root);
        if (agent?.status === "completed") return {status: "completed", rootAgentId: root, summary: agent.result};
        if (agent?.status === "waiting") return {status: "waiting", rootAgentId: root, waitingReason: "approval"};
        if (agent?.status === "cancelled") return {status: "cancelled", rootAgentId: root};
        return {status: "failed", rootAgentId: root, error: agent?.error ?? "agent execution failed", retryable: true};
      },
    };
    let control;
    if (this.control) control = this.control;
    else if (this.optionsControl) {
      control = await startControlPlane(this, this.optionsControl);
      this.control = control;
    }
    this.daemon = new Daemon(this.state, {
      provider: this.provider,
      jobRunner: runner,
      controlPlane: control?.server,
      maxConcurrentJobs: this.maxConcurrent,
      ...(this.daemonOpts ?? {}),
    });
    await this.daemon.start();
    return {daemonId: this.daemon.daemonId, controlUrl: control ? withAddress(control.server) : undefined};
  }

  /** Stop the daemon and control plane gracefully. */
  async stop(): Promise<void> {
    if (this.daemon) {
      await this.daemon.stop();
      this.daemon = undefined;
    }
    if (this.control) {
      await this.control.server.stop().catch(() => undefined);
      this.control = undefined;
    }
  }

  /** Subscribe to stable Loom events. */
  onEvent(handler: (event: LoomAppEvent) => void): () => void {
    const listener = (e: LoomAppEvent) => handler(e);
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  get schemaVersion(): number {
    return this.state.getSchemaVersion();
  }

  get version(): {sdk: string; protocol: number; schema: number} {
    return {sdk: SDK_API_VERSION, protocol: PROTOCOL_MAJOR, schema: SCHEMA_VERSION};
  }

  private buildToolPolicy(): ToolPolicy {
    const permissions: Record<string, PermissionLevel> = {...(this.policy.tools ?? {})};
    for (const [name, tool] of this.sdkTools) {
      if (tool.permissions) permissions[name] = tool.permissions;
      else if (tool.approval) permissions[name] = "ask";
    }
    return {permissions, allowAsk: true, maxResultChars: 20000};
  }

  private emitEvent(event: LoomAppEvent): void {
    this.events.emit("event", event);
  }
}

function resolveProvider(provider?: Provider | {id: string; model?: string; apiKeyEnv?: string}): Provider {
  if (provider && typeof (provider as Provider).complete === "function") {
    return provider as Provider;
  }
  const spec = provider as {id: string; model?: string; apiKeyEnv?: string} | undefined;
  const id = spec?.id ?? process.env.LOOM_PROVIDER ?? "mock";
  if (id === "mock") return new MockProvider();
  if (id === "openai") {
    const model = spec?.model ?? process.env.LOOM_MODEL;
    const key = spec?.apiKeyEnv ? process.env[spec.apiKeyEnv] : process.env.LOOM_API_KEY;
    return new OpenAICompatibleProvider(key, model);
  }
  throw new Error(`unknown provider id: ${id}. Register a provider via app.registerProvider().`);
}

async function startControlPlane(app: LoomApp, options: import("@loom/control").ControlOptions): Promise<{service: import("@loom/control").ControlPlaneService; server: import("@loom/control").ControlServer}> {
  const {ControlPlaneService, ControlServer} = await import("@loom/control");
  const service = new ControlPlaneService(app.state, {});
  const server = new ControlServer(service, options);
  return {service, server};
}

function withAddress(server: import("@loom/control").ControlServer): string | undefined {
  const addr = server.address();
  if (!addr) return undefined;
  const host = addr.address === "::" ? "localhost" : addr.address;
  return `http://${host}:${addr.port}`;
}

export function createLoomApp(options: LoomAppOptions = {}): LoomApp {
  const app = new LoomApp(options);
  if (options.controlPlane) (app as unknown as Record<string, unknown>)["optionsControl"] = options.controlPlane;
  if (options.daemon) (app as unknown as Record<string, unknown>)["daemonOpts"] = options.daemon;
  if (options.maxConcurrent) (app as unknown as Record<string, unknown>)["maxConcurrent"] = options.maxConcurrent;
  return app;
}

/** Convenience: create an application from a versioned manifest. */
export function defineLoomApp(manifest: LoomAppManifest): LoomApp {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}. V1.0 supports schemaVersion 1.`);
  }
  return createLoomApp({manifest});
}
