import chalk from "chalk";
import type { Component } from "../tui.js";
import { truncateToWidth, visibleWidth } from "../utils.js";

export interface WelcomeCardOptions {
  version: string;
  model: string;
  provider: string;
  cwd: string;
  mcpServersCount?: number;
  toolsCount?: number;
}

/** A compact, readable first screen for the interactive terminal. */
export class LoomWelcomeCard implements Component {
  constructor(private readonly options: WelcomeCardOptions) {}

  render(width: number): string[] {
    const cardWidth = Math.min(Math.max(width - 2, 64), 112);
    const innerWidth = cardWidth - 2;
    const violet = chalk.rgb(167, 139, 250);
    const cyan = chalk.rgb(34, 211, 238);
    const green = chalk.rgb(52, 211, 153);
    const amber = chalk.rgb(251, 191, 36);
    const muted = chalk.rgb(148, 163, 184);
    const model = this.options.model && this.options.model !== "mock" ? this.options.model : "claude-3-7-sonnet";
    const provider = this.options.provider && this.options.provider !== "mock" ? this.options.provider : "anthropic";
    const cwd = this.options.cwd.length > 42 ? `…${this.options.cwd.slice(-41)}` : this.options.cwd;
    const mcp = this.options.mcpServersCount ?? 0;
    const tools = this.options.toolsCount ?? 0;
    const fit = (value: string): string => {
      const text = truncateToWidth(value, innerWidth);
      return text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
    };
    const row = (value: string): string => violet("│") + fit(` ${value}`) + violet("│");
    const rule = (left: string, right: string): string => violet(left + "─".repeat(innerWidth) + right);
    return [
      rule("╭", "╮"),
      row(`${violet("◆")} ${chalk.bold.white("LOOM AGENT")} ${muted(`v${this.options.version}`)}  ${green("● ready")}`),
      row(`${muted("model")} ${chalk.bold.cyan(model)}  ${muted("provider")} ${chalk.bold.white(provider.toUpperCase())}`),
      row(`${muted("workspace")} ${chalk.white(cwd)}  ${muted("tools")} ${cyan(String(tools))}  ${muted("MCP")} ${mcp ? amber(String(mcp)) : muted("none")}`),
      row(`${muted("mode")} ${chalk.white("adaptive multi-agent execution")}  ${muted("approval")} ${chalk.white("Shift+Tab")}`),
      rule("├", "┤"),
      row(`${amber("Quick start")}  ${muted("type a goal to begin")}   ${cyan("/")} ${muted("commands")}   ${cyan("Shift+Tab")} ${muted("approval mode")}`),
      rule("╰", "╯"),
    ];
  }

  invalidate(): void {}
}
