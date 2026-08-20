import chalk from "chalk";
import Fuse from "fuse.js";
import type { Component } from "../tui.js";
import { matchesKey } from "../keys.js";
import { visibleWidth, truncateToWidth } from "../utils.js";

export type SettingsTab = "providers" | "models" | "mcp";

export interface ProviderItem {
  id: string;
  name: string;
  category: string;
  isConfigured: boolean;
  statusText?: string;
  authMethod?: "oauth" | "apikey" | "endpoint";
}

export interface ModelItem {
  id: string;
  name: string;
  provider: string;
  isCurrent?: boolean;
}

export interface McpItem {
  id: string;
  name: string;
  category: string;
  isConfigured: boolean;
  toolCount?: number;
}

export interface SettingsDialogProps {
  initialTab?: SettingsTab;
  currentModel: string;
  currentProvider: string;
  providers?: ProviderItem[];
  models?: ModelItem[];
  mcpConnections?: McpItem[];
  onSelectModel: (modelId: string, providerId: string) => void;
  onSelectProvider: (providerId: string, authMethod?: "oauth" | "apikey" | "endpoint") => void;
  onClose: () => void;
}

const DEFAULT_PROVIDERS: ProviderItem[] = [
  { id: "opencode", name: "OpenCode (AI Coding Engine)", category: "API Key / Local Server", isConfigured: true, statusText: "configured", authMethod: "apikey" },
  { id: "anthropic", name: "Anthropic (Claude 3.7 / 3.5)", category: "OAuth (Claude Pro/Max) / API Key", isConfigured: true, statusText: "configured", authMethod: "oauth" },
  { id: "openai", name: "OpenAI (GPT-4o, o3-mini)", category: "OAuth (ChatGPT Plus) / API Key", isConfigured: true, statusText: "configured", authMethod: "oauth" },
  { id: "google", name: "Google Gemini (Gemini 2.5 Flash / Pro)", category: "API Key", isConfigured: true, statusText: "configured", authMethod: "apikey" },
  { id: "mistral", name: "Mistral AI (Codestral, Mistral Large)", category: "API Key", isConfigured: false, statusText: "unconfigured", authMethod: "apikey" },
  { id: "ollama", name: "Ollama (Local Models)", category: "Local Server Endpoint", isConfigured: true, statusText: "configured", authMethod: "endpoint" },
  { id: "openrouter", name: "OpenRouter", category: "API Key", isConfigured: false, statusText: "unconfigured", authMethod: "apikey" },
  { id: "deepseek", name: "DeepSeek (DeepSeek V3 / R1)", category: "API Key", isConfigured: false, statusText: "unconfigured", authMethod: "apikey" },
  { id: "groq", name: "Groq (Llama 3.3 Ultra-fast)", category: "API Key", isConfigured: false, statusText: "unconfigured", authMethod: "apikey" },
];

const DEFAULT_MODELS: ModelItem[] = [
  { id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet", provider: "anthropic", isCurrent: true },
  { id: "claude-3-5-haiku-20241022", name: "claude-3-5-haiku", provider: "anthropic" },
  { id: "gemini-2.5-flash", name: "gemini-2.5-flash", provider: "google" },
  { id: "gemini-2.5-pro", name: "gemini-2.5-pro", provider: "google" },
  { id: "gpt-4o", name: "gpt-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "gpt-4o-mini", provider: "openai" },
  { id: "o3-mini", name: "o3-mini", provider: "openai" },
  { id: "mistral-large-latest", name: "mistral-large-latest", provider: "mistral" },
  { id: "codestral-latest", name: "codestral-latest", provider: "mistral" },
  { id: "qwen2.5-coder:7b", name: "qwen2.5-coder:7b", provider: "ollama" },
  { id: "deepseek-chat", name: "deepseek-chat", provider: "deepseek" },
];

const DEFAULT_MCP: McpItem[] = [
  { id: "serper", name: "Serper (web search)", category: "api key", isConfigured: true },
  { id: "chrome-devtools", name: "Chrome DevTools", category: "mcp bridge", isConfigured: true },
  { id: "github", name: "GitHub MCP Server", category: "token", isConfigured: false },
  { id: "linear", name: "Linear Integration", category: "api key", isConfigured: false },
  { id: "notion", name: "Notion Workspace", category: "subscription", isConfigured: false },
  { id: "postgres", name: "PostgreSQL Database", category: "database connection", isConfigured: false },
];

export class SettingsMultiTabDialog implements Component {
  private currentTab: SettingsTab;
  private selectedIndex = 0;
  private searchQuery = "";
  private providers: ProviderItem[];
  private models: ModelItem[];
  private mcpConnections: McpItem[];

  constructor(private readonly props: SettingsDialogProps) {
    this.currentTab = props.initialTab ?? "providers";
    this.providers = props.providers ?? DEFAULT_PROVIDERS;
    const activeProvider = props.currentProvider.toLowerCase();
    this.models = (props.models ?? DEFAULT_MODELS).filter((model) => model.provider.toLowerCase() === activeProvider);
    this.mcpConnections = props.mcpConnections ?? [];

    // Check environment keys for providers
    if (typeof process !== "undefined" && process.env) {
      if (process.env.ANTHROPIC_API_KEY) this.setProviderConfigured("anthropic", true);
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) this.setProviderConfigured("google", true);
      if (process.env.OPENAI_API_KEY) this.setProviderConfigured("openai", true);
      if (process.env.MISTRAL_API_KEY) this.setProviderConfigured("mistral", true);
    }
  }

  private setProviderConfigured(id: string, configured: boolean): void {
    const p = this.providers.find((item) => item.id === id);
    if (p) {
      p.isConfigured = configured;
      p.statusText = configured ? "configured" : "unconfigured";
    }
  }

  public updateModels(newModels: ModelItem[]): void {
    if (newModels && newModels.length > 0) {
      const activeProvider = this.props.currentProvider.toLowerCase();
      this.models = newModels.filter((model) => model.provider.toLowerCase() === activeProvider);
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.props.onClose();
      return;
    }

    if (matchesKey(data, "shift+tab") || matchesKey(data, "left") || data === "\x1b[Z" || data === "\x1b[1;2Z") {
      this.switchPrevTab();
      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "right") || data === "\t") {
      this.switchNextTab();
      return;
    }

    if (matchesKey(data, "up")) {
      const list = this.getCurrentFilteredList();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + list.length) % list.length;
      }
      return;
    }

    if (matchesKey(data, "down")) {
      const list = this.getCurrentFilteredList();
      if (list.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % list.length;
      }
      return;
    }

    if (matchesKey(data, "return") || matchesKey(data, "enter")) {
      this.handleSelectCurrent();
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.selectedIndex = 0;
      }
      return;
    }

    // Printable character for searching
    if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
      this.searchQuery += data;
      this.selectedIndex = 0;
    }
  }

  private switchNextTab(): void {
    const tabs: SettingsTab[] = ["providers", "models", "mcp"];
    const idx = tabs.indexOf(this.currentTab);
    this.currentTab = tabs[(idx + 1) % tabs.length]!;
    this.selectedIndex = 0;
    this.searchQuery = "";
  }

  private switchPrevTab(): void {
    const tabs: SettingsTab[] = ["providers", "models", "mcp"];
    const idx = tabs.indexOf(this.currentTab);
    this.currentTab = tabs[(idx - 1 + tabs.length) % tabs.length]!;
    this.selectedIndex = 0;
    this.searchQuery = "";
  }

  private getCurrentFilteredList(): Array<ProviderItem | ModelItem | McpItem> {
    const q = this.searchQuery.trim().toLowerCase();
    if (this.currentTab === "providers") {
      return q ? this.providers.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : this.providers;
    }
    if (this.currentTab === "models") {
      return q ? this.models.filter((m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)) : this.models;
    }
    return q ? this.mcpConnections.filter((c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : this.mcpConnections;
  }

  private handleSelectCurrent(): void {
    const list = this.getCurrentFilteredList();
    const item = list[this.selectedIndex];
    if (!item) return;

    if (this.currentTab === "models") {
      const m = item as ModelItem;
      this.props.onSelectModel(m.id, m.provider);
      this.props.onClose();
    } else if (this.currentTab === "providers") {
      const p = item as ProviderItem;
      this.props.onSelectProvider(p.id, p.authMethod ?? "apikey");
      this.props.onClose();
    } else {
      this.props.onClose();
    }
  }

  render(width: number): string[] {
    const cardWidth = Math.min(Math.max(width, 50), 96);
    const innerWidth = cardWidth - 2;
    const border = chalk.rgb(71, 85, 105);
    const divider = chalk.rgb(51, 65, 85);
    const dim = chalk.rgb(100, 116, 139);
    const muted = chalk.rgb(148, 163, 184);

    const fit = (value: string): string => {
      const text = truncateToWidth(value, innerWidth);
      return text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
    };

    const row = (value = ""): string => border("│") + fit(value ? ` ${value}` : "") + border("│");
    const emptyRow = (): string => border("│") + " ".repeat(innerWidth) + border("│");

    const lines: string[] = [];
    const maxVisibleRows = 6;

    lines.push(border("╭" + "─".repeat(innerWidth) + "╮"));

    // Header Title and Description per tab
    if (this.currentTab === "providers") {
      lines.push(row(`${chalk.bold.rgb(167, 139, 250)("◆")} ${chalk.bold.white("Providers")}`));
      lines.push(row(dim("Connect with a subscription, API key, or local server.")));
    } else if (this.currentTab === "models") {
      lines.push(row(`${chalk.bold.rgb(167, 139, 250)("◆")} ${chalk.bold.white("Models")}`));
      lines.push(row(dim("All models across supported providers.")));
    } else {
      lines.push(row(`${chalk.bold.rgb(167, 139, 250)("◆")} ${chalk.bold.white("MCP Connections")}`));
      lines.push(row(dim("Connect MCP integrations and service credentials.")));
    }

    lines.push(emptyRow());

    // Tabs Header
    const tabItem = (tab: SettingsTab, label: string) => {
      const isSelected = this.currentTab === tab;
      return isSelected
        ? chalk.rgb(168, 85, 247).bold(`[ ▶ ${label} ]`)
        : chalk.dim(`[   ${label} ]`);
    };

    const tabsLine = `Tabs:  ${tabItem("providers", "Providers")}  ${tabItem("models", "Models")}  ${tabItem("mcp", "MCP Connections")}`;
    lines.push(row(tabsLine));
    lines.push(row(dim("Tab/Shift+Tab switch tabs · Esc close")));
    lines.push(emptyRow());

    // Search bar with cursor
    const searchPrompt = this.searchQuery
      ? `Search: ${chalk.bold.white(this.searchQuery)}${chalk.bgWhite.black(" ")}`
      : `Search: ${chalk.bgWhite.black(" ")}`;
    lines.push(row(searchPrompt));
    lines.push(border("├" + divider("─".repeat(innerWidth)) + "┤"));

    // List rendering
    const list = this.getCurrentFilteredList();
    if (list.length === 0) {
      lines.push(row(dim("  (No matching items found)")));
      lines.push(emptyRow());
    } else {
      const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(maxVisibleRows / 2), list.length - maxVisibleRows));
      const visibleItems = list.slice(startIndex, startIndex + maxVisibleRows);

      for (let i = 0; i < visibleItems.length; i++) {
        const item = visibleItems[i]!;
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === this.selectedIndex;

        let titleStr = "";
        let subStr = "";
        let statusTag = "";

        if (this.currentTab === "providers") {
          const p = item as ProviderItem;
          titleStr = p.name;
          subStr = p.category;
          statusTag = p.isConfigured
            ? chalk.green("configured")
            : chalk.dim("unconfigured");
        } else if (this.currentTab === "models") {
          const m = item as ModelItem;
          titleStr = m.name;
          subStr = m.provider;
          const isCurrent = m.id === this.props.currentModel || m.name === this.props.currentModel;
          statusTag = isCurrent ? chalk.green("current") : "";
        } else {
          const c = item as McpItem;
          titleStr = c.name;
          subStr = c.category;
          statusTag = c.isConfigured ? chalk.green("configured") : chalk.dim("unconfigured");
        }

        const titleVisible = visibleWidth(titleStr);
        const statusVisible = visibleWidth(statusTag);
        const gap = Math.max(2, innerWidth - titleVisible - statusVisible - 4);

        if (isSelected) {
          lines.push(row(chalk.bgRgb(51, 65, 85).white.bold(` › ${titleStr}${" ".repeat(gap)}${statusTag} `)));
          lines.push(row(chalk.bgRgb(51, 65, 85).cyan(`   ${subStr}${" ".repeat(Math.max(1, innerWidth - visibleWidth(subStr) - 6))} `)));
        } else {
          lines.push(row(`   ${chalk.white(titleStr)}${" ".repeat(gap)}${statusTag}`));
          lines.push(row(`   ${chalk.dim(subStr)}`));
        }
      }

      // Count footer (e.g. (1/34))
      lines.push(emptyRow());
      lines.push(row(dim(` (${this.selectedIndex + 1}/${list.length})`)));
    }

    lines.push(border("╰" + "─".repeat(innerWidth) + "╯"));
    return lines;
  }

  invalidate(): void {}
}
