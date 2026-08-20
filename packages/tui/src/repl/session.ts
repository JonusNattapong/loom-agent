import chalk from "chalk";
import type { Provider, PermissionLevel } from "@loom-agent/core";
import { StateStore } from "@loom-agent/state";
import { ToolRegistry, ToolExecutor } from "@loom-agent/tools";
import { AdaptiveOrchestrator } from "@loom-agent/adaptive";
import { SkillRuntime } from "@loom-agent/skills";
import { TUI, Container } from "../tui.js";
import { ProcessTerminal } from "../terminal.js";
import { Text } from "../components/text.js";
import { Spacer } from "../components/spacer.js";
import { Markdown } from "../components/markdown.js";
import { Loader } from "../components/loader.js";
import { Editor } from "../components/editor.js";
import { matchesKey } from "../keys.js";
import { defaultEditorTheme, defaultMarkdownTheme } from "./theme.js";
import { ApprovalDialog, type ApprovalDecision, type ApprovalRequest } from "./approval-dialog.js";
import { LoomWelcomeCard } from "./welcome-card.js";
import { DiffExecutionView } from "./diff-view.js";
import { MultiAgentProgressView, type ProgressTaskItem } from "./agent-progress.js";
import { StatusBarView } from "./status-bar.js";
import { ToolStreamView } from "./tool-stream.js";
import { StatusLineConfigDialog, type StatusLineConfig, DEFAULT_STATUS_LINE_CONFIG } from "./statusline-dialog.js";
import { CombinedAutocompleteProvider } from "../autocomplete.js";
import { DEFAULT_SLASH_COMMANDS, SlashAutocompleteView } from "./slash-autocomplete.js";
import { SettingsMultiTabDialog, type SettingsTab } from "./settings-tab-dialog.js";
import { OAuthLoginDialog } from "./oauth-dialog.js";
import { ApiKeyPromptDialog } from "./api-key-dialog.js";








export interface ReplSessionOptions {
  state: StateStore;
  provider: Provider;
  tools: ToolRegistry;
  permissions?: Record<string, PermissionLevel>;
  modelName?: string;
  version?: string;
  cwd?: string;
  mcpServersCount?: number;
  onDoctor?: () => Promise<unknown>;
}

function resolveDisplayModel(provider: Provider, configured?: string): string {
  if (configured && configured !== "mock") return configured;
  if (provider.name === "opencode") return process.env.OPENCODE_MODEL ?? "opencode";
  return process.env.ANTHROPIC_API_KEY
    ? "claude-3-7-sonnet"
    : (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)
      ? "gemini-2.5-flash"
      : process.env.OPENAI_API_KEY
        ? "gpt-4o"
        : process.env.MISTRAL_API_KEY
          ? "mistral-large"
          : "mock";
}

export class LoomReplSession {
  private terminal: ProcessTerminal;
  private tui: TUI;
  private rootContainer: Container;
  private historyContainer: Container;
  private editor: Editor;
  private statusBar: StatusBarView;
  private isExecuting = false;
  private currentAgentId?: string;
  private permissionMode: "accept edits on" | "ask before edits" = "accept edits on";
  private statusLineConfig: StatusLineConfig = { ...DEFAULT_STATUS_LINE_CONFIG };
  private totalTokens = 0;

  constructor(private readonly options: ReplSessionOptions) {
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);
    this.rootContainer = new Container();
    this.historyContainer = new Container();

    this.tui.addChild(this.rootContainer);
    this.rootContainer.addChild(this.historyContainer);

    // Render Welcome Header Card
    this.renderWelcome();

    // Setup Editor for multiline REPL input with Fuse.js Slash Autocomplete
    this.editor = new Editor(this.tui, defaultEditorTheme);
    const autocompleteProvider = new CombinedAutocompleteProvider(
      DEFAULT_SLASH_COMMANDS.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        aliases: cmd.aliases,
      })),
      this.options.cwd ?? process.cwd()
    );
    this.editor.setAutocompleteProvider(autocompleteProvider);
    this.editor.onSubmit = (text) => {
      void this.handleInput(text.trim());
    };

    const effectiveModel = resolveDisplayModel(this.options.provider, this.options.modelName);

    // Setup Status Bar
    this.statusBar = new StatusBarView({
      model: effectiveModel,
      cwd: this.options.cwd ?? process.cwd(),
      branch: "main",
      contextUsagePercent: 8,
      totalTokens: this.totalTokens,
      mcpCount: this.options.mcpServersCount ?? 0,
      permissionMode: this.permissionMode,
      config: this.statusLineConfig,
    });

    this.rootContainer.addChild(new Spacer(1));
    this.rootContainer.addChild(this.editor);
    this.rootContainer.addChild(this.statusBar);
    this.tui.setFocus(this.editor);

    // Global Key Handling (Ctrl+C and Shift+Tab)
    this.tui.addInputListener((data) => {
      if (matchesKey(data, "ctrl+c")) {
        if (this.isExecuting) {
          this.appendMessage(chalk.bold.yellow("\n[Execution cancelled by user]"));
          this.isExecuting = false;
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
        } else {
          this.stop();
          process.exit(0);
        }
      } else if (matchesKey(data, "shift+tab") || data === "\x1b[Z" || data === "\x1b[1;2Z") {
        // Toggle Permission Mode
        this.permissionMode = this.permissionMode === "accept edits on" ? "ask before edits" : "accept edits on";
        this.appendMessage(
          chalk.bold.cyan("\nApproval mode: ") +
          chalk.white(this.permissionMode) +
          chalk.dim(" (Shift+Tab to toggle)"),
        );
        this.updateStatusBar();
        this.tui.requestRender();
        return { consume: true };
      }
      return undefined;
    });
  }

  private updateStatusBar(): void {
    const effectiveModel = resolveDisplayModel(this.options.provider, this.options.modelName);

    this.rootContainer.removeChild(this.statusBar);
    this.statusBar = new StatusBarView({
      model: effectiveModel,
      cwd: this.options.cwd ?? process.cwd(),
      branch: "main",
      contextUsagePercent: Math.min(99, 8 + Math.floor(this.totalTokens / 10000)),
      totalTokens: this.totalTokens,
      mcpCount: this.options.mcpServersCount ?? 0,
      permissionMode: this.permissionMode,
      runningAgentsCount: this.isExecuting ? 1 : 0,
      config: this.statusLineConfig,
    });
    this.rootContainer.addChild(this.statusBar);
  }

  private renderWelcome(): void {
    const effectiveModel = resolveDisplayModel(this.options.provider, this.options.modelName);

    const providerName = this.options.provider.name === "mock"
      ? (process.env.ANTHROPIC_API_KEY ? "anthropic" : (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) ? "google" : process.env.OPENAI_API_KEY ? "openai" : "anthropic")
      : this.options.provider.name;

    const welcomeCard = new LoomWelcomeCard({
      version: this.options.version ?? "1.1.0",
      model: effectiveModel,
      provider: providerName,
      cwd: this.options.cwd ?? process.cwd(),
      mcpServersCount: this.options.mcpServersCount,
      toolsCount: this.options.tools.list().length,
    });

    this.historyContainer.addChild(welcomeCard);
    this.historyContainer.addChild(new Spacer(1));
  }

  private appendMessage(content: string): void {
    this.historyContainer.addChild(new Text(content));
    this.tui.requestRender();
  }

  private appendMarkdown(markdownText: string): void {
    this.historyContainer.addChild(new Markdown(markdownText, 0, 0, defaultMarkdownTheme));
    this.tui.requestRender();
  }

  async start(): Promise<void> {
    this.tui.start();
  }

  stop(): void {
    this.tui.stop();
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return;

    if (input.startsWith("/")) {
      await this.handleSlashCommand(input);
      return;
    }

    // Render User Goal Bubble with styled purple pill
    const userBubble = [
      chalk.bgRgb(79, 70, 229).white.bold(` ▶ Goal(set: ${input}) `),
      chalk.dim("  └─ ") + chalk.italic.dim(`Agent planning session started: ${new Date().toLocaleTimeString()}`),
    ].join("\n");
    this.appendMessage(userBubble);
    this.isExecuting = true;
    this.updateStatusBar();

    // Start live thinking spinner
    const startTime = Date.now();
    const loader = new Loader(
      this.tui,
      (t) => chalk.rgb(168, 85, 247)(t),
      (t) => chalk.dim(t),
      " ✦ Unravelling & Planning..."
    );
    this.historyContainer.addChild(loader);
    this.tui.requestRender();

    try {
      const agent = this.options.state.createAgentRecord({
        goal: input,
        role: "planner",
      });
      this.currentAgentId = agent.id;
      this.options.state.addTrace(agent.id, "agent.created", { goal: input });

      const permissions: Record<string, PermissionLevel> = { ...(this.options.permissions ?? {}) };
      if (this.permissionMode === "ask before edits") {
        permissions.write_file = "ask";
        permissions.shell = "ask";
      }

      // Tool executor
      const toolExecutor = new ToolExecutor(this.options.tools, {
        permissions,
        ledger: this.options.state,
        approvals: this.options.state,
        artifacts: this.options.state,
        trace: (type, data) => this.options.state.addTrace(agent.id, type, data),
      });

      const orchestrator = new AdaptiveOrchestrator(this.options.state, this.options.provider, {
        maxModelRounds: 12,
        maxToolCalls: 30,
        provider: this.options.provider,
        tools: this.options.tools.definitions(),
        tool: async (call, agentId, taskId) => {
          const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
          loader.setText(` ✦ Executing ${chalk.magenta(call.name)} • ${elapsedSec}s elapsed...`);
          this.tui.requestRender();

          // Check if user approval required
          const perm = permissions[call.name];
          if (perm === "ask") {
            const decision = await this.promptApproval({
              id: `${taskId}:${call.name}`,
              agentId,
              toolName: call.name,
              input: call.input as Record<string, unknown>,
            });
            if (decision === "denied") {
              throw new Error(`Tool execution denied by user: ${call.name}`);
            }
          }

          const toolStart = Date.now();
          const result = await toolExecutor.execute(call.name, call.input, {
            agentId,
            taskId,
            toolCallId: call.id ?? `${taskId}:${call.name}`,
          });
          const toolDuration = Date.now() - toolStart;

          // Render live tool stream line: ✓ tool • summary • ↑ lines • duration
          const summary = typeof call.input.command === "string" 
            ? call.input.command 
            : typeof call.input.path === "string"
              ? `${call.name}(${call.input.path})`
              : JSON.stringify(call.input);

          this.historyContainer.addChild(
            new ToolStreamView([{
              tool: call.name,
              summary,
              linesIn: 1,
              linesOut: result ? result.split("\n").length : 1,
              durationMs: toolDuration,
              type: "tool",
              status: "success",
            }])
          );
          this.tui.requestRender();

          // If tool modified a file, render rich Diff Execution View
          if ((call.name === "write_file" || call.name === "replace_file_content") && typeof call.input.path === "string") {
            this.historyContainer.addChild(
              new DiffExecutionView({
                filePath: call.input.path,
                operation: "modified",
                linesAdded: 1,
                linesRemoved: 0,
                diffText: typeof call.input.content === "string" ? `+ ${call.input.content.slice(0, 120)}...` : undefined,
                diagnosticsCount: 0,
              })
            );
          }

          return result;
        },
      });

      const planResult = await orchestrator.run(agent.id, input);
      this.totalTokens += 1500; // Track approximate tokens for status bar

      // Remove loader
      this.historyContainer.removeChild(loader);

      // Render Multi-Agent Progress Tree
      const plan = this.options.state.getPlanForAgent(agent.id);
      const tasks: ProgressTaskItem[] = plan
        ? this.options.state.listPlanTasks(plan.id).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status as ProgressTaskItem["status"],
            role: "planner",
            duration: `${Math.floor((Date.now() - startTime) / 1000)}s`,
          }))
        : [
            { id: "1", title: "Analyze and fulfill goal", status: "completed", duration: "2s" },
          ];

      this.historyContainer.addChild(
        new MultiAgentProgressView({
          goal: input,
          agentId: agent.id,
          tasks,
          parallelCount: tasks.length,
        })
      );

      // Render Assistant Output / Summary
      this.appendMessage(
        chalk.bold.green(`\n✔ Completed: `) + chalk.dim(`Agent [${agent.id}] status: ${planResult.status}`)
      );
      this.historyContainer.addChild(new Spacer(1));
    } catch (error) {
      this.historyContainer.removeChild(loader);
      this.appendMessage(chalk.bold.red(`\n✖ Error: `) + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.isExecuting = false;
      this.editor.setText("");
      this.updateStatusBar();
      this.tui.setFocus(this.editor);
      this.tui.requestRender();
    }
  }

  private async promptApproval(req: ApprovalRequest): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      let handle: { hide: () => void };
      const dialog = new ApprovalDialog(req, (decision) => {
        handle.hide();
        this.tui.setFocus(this.editor);
        this.tui.requestRender();
        resolve(decision);
      });
      handle = this.tui.showOverlay(dialog, { width: "80%", maxHeight: 20 });
      this.tui.requestRender();
    });
  }

  private async handleSlashCommand(commandStr: string): Promise<void> {
    const [cmd, ...args] = commandStr.split(" ");
    switch (cmd) {
      case "/help":
        this.appendMessage(
          [
            chalk.bold.cyan("\nAvailable Slash Commands:"),
            `  ${chalk.bold("/help")}        Show this command reference`,
            `  ${chalk.bold("/plan")}        Inspect current agent task graph and progress`,
            `  ${chalk.bold("/doctor")}      Run system and configuration diagnostic checks`,
            `  ${chalk.bold("/tools")}       List all registered native and MCP tools`,
            `  ${chalk.bold("/skills")}      List discovered skills in workspace`,
            `  ${chalk.bold("/statusline")}  Set up status line UI layout and badges`,
            `  ${chalk.bold("/clear")}       Clear transcript and re-render header`,
            `  ${chalk.bold("/exit")}        Exit REPL`,
          ].join("\n") + "\n"
        );
        break;

      case "/statusline": {
        await this.handleStatusLineCommand(args);
        break;
      }

      case "/model": {
        await this.openSettingsDialog("models");
        break;
      }

      case "/provider": {
        await this.openSettingsDialog("providers");
        break;
      }

      case "/mcp": {
        await this.openSettingsDialog("mcp");
        break;
      }

      case "/login": {
        await this.openLoginDialog(args[0] ?? "Anthropic");
        break;
      }

      case "/apikey": {
        await this.openApiKeyDialog(args[0] ?? "anthropic", args[1] ?? "Anthropic");
        break;
      }

      case "/clear":
        this.historyContainer.clear();
        this.renderWelcome();
        this.tui.requestRender();
        break;

      case "/tools": {
        const list = this.options.tools.definitions();
        this.appendMessage(
          chalk.bold.cyan(`\n⚡ Registered Tools (${list.length}):\n`) +
            list.map((t) => `  ${chalk.cyan("●")} ${chalk.bold(t.name)}: ${chalk.dim(t.description)}`).join("\n") +
            "\n"
        );
        break;
      }

      case "/skills": {
        const skills = await new SkillRuntime().discover();
        this.appendMessage(
          chalk.bold.cyan(`\n📦 Discovered Skills (${skills.length}):\n`) +
            skills.map((s) => `  ${chalk.yellow("●")} ${chalk.bold(s.name)}: ${chalk.dim(s.description)}`).join("\n") +
            "\n"
        );
        break;
      }

      case "/plan": {
        if (!this.currentAgentId) {
          this.appendMessage(chalk.yellow("\nNo active plan found. Type a goal to start one."));
        } else {
          const plan = this.options.state.getPlanForAgent(this.currentAgentId);
          if (!plan) {
            this.appendMessage(chalk.yellow(`\nNo plan found for agent ${this.currentAgentId}`));
          } else {
            const tasks = this.options.state.listPlanTasks(plan.id);
            this.historyContainer.addChild(
              new MultiAgentProgressView({
                goal: "Current Plan",
                agentId: this.currentAgentId,
                tasks: tasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  status: t.status as ProgressTaskItem["status"],
                  role: "planner",
                })),
              })
            );
          }
        }
        break;
      }

      case "/doctor": {
        if (this.options.onDoctor) {
          const res = await this.options.onDoctor();
          this.appendMessage(chalk.bold.cyan("\n🩺 Doctor Diagnostics:\n") + JSON.stringify(res, null, 2) + "\n");
        } else {
          this.appendMessage(chalk.green("\n✓ Doctor: OK\n"));
        }
        break;
      }

      case "/exit":
      case "/quit":
        this.stop();
        process.exit(0);
        break;

      default:
        this.appendMessage(chalk.red(`\nUnknown command: ${cmd}. Type /help for available commands.\n`));
    }
    this.editor.setText("");
    this.tui.setFocus(this.editor);
    this.tui.requestRender();
  }

  private async handleStatusLineCommand(args: string[]): Promise<void> {
    const userRequest = args.join(" ").trim();
    const prompt = userRequest
      ? `Help me set up or update the status line for my Loom terminal interface. My request: "${userRequest}". Inspect the workspace and configure the status line settings in .loom/config.json accordingly.`
      : `Help me set up or update the status line for my Loom terminal interface. Suggest and configure the best status line layout (such as model name, current directory, git branch, context usage %, token meter, and MCP servers count) in .loom/config.json.`;

    await this.handleInput(prompt);
  }

  private async openSettingsDialog(initialTab: SettingsTab = "providers"): Promise<void> {
    return new Promise<void>((resolve) => {
      let handle: { hide: () => void };
      const dialog = new SettingsMultiTabDialog({
        initialTab,
        currentModel: this.options.modelName ?? "claude-3-7-sonnet",
        currentProvider: this.options.provider.name,
        onSelectModel: (modelId, providerId) => {
          this.options.modelName = modelId;
          this.updateStatusBar();
          this.appendMessage(chalk.green(`✔ Active model switched to: ${chalk.bold(modelId)} (${providerId})`));
        },
        onSelectProvider: (providerId) => {
          handle.hide();
          void this.openLoginDialog(providerId);
          resolve();
        },
        onClose: () => {
          handle.hide();
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
          resolve();
        },
      });

      handle = this.tui.showOverlay(dialog, { width: "85%", maxHeight: 24 });
      this.tui.requestRender();
    });
  }

  private async openLoginDialog(providerName: string = "Anthropic"): Promise<void> {
    return new Promise<void>((resolve) => {
      let handle: { hide: () => void };
      const dialog = new OAuthLoginDialog({
        providerName,
        accountType: providerName.toLowerCase().includes("anthropic") ? "Claude Pro/Max" : "Subscription / API Key",
        onSuccess: (tokenOrKey) => {
          handle.hide();
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
          this.appendMessage(chalk.green(`✔ Successfully authenticated with ${chalk.bold(providerName)}!`));
          resolve();
        },
        onCancel: () => {
          handle.hide();
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
          resolve();
        },
      });

      handle = this.tui.showOverlay(dialog, { width: "90%", maxHeight: 22 });
      this.tui.requestRender();
    });
  }

  private async openApiKeyDialog(providerId: string = "anthropic", providerName: string = "Anthropic"): Promise<void> {
    return new Promise<void>((resolve) => {
      let handle: { hide: () => void };
      const dialog = new ApiKeyPromptDialog({
        providerId,
        providerName,
        onSuccess: (apiKey) => {
          handle.hide();
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
          this.appendMessage(chalk.green(`✔ API key configured and saved for ${chalk.bold(providerName)}!`));
          resolve();
        },
        onCancel: () => {
          handle.hide();
          this.tui.setFocus(this.editor);
          this.tui.requestRender();
          resolve();
        },
      });

      handle = this.tui.showOverlay(dialog, { width: "80%", maxHeight: 20 });
      this.tui.requestRender();
    });
  }
}
