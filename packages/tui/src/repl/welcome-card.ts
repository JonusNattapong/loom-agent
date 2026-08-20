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
    const cardWidth = Math.min(Math.max(width - 2, 64), 100);
    const innerWidth = cardWidth - 2;

    const border = chalk.rgb(71, 85, 105);
    const divider = chalk.rgb(51, 65, 85);
    const brand = chalk.rgb(167, 139, 250);
    const muted = chalk.rgb(148, 163, 184);
    const dim = chalk.rgb(100, 116, 139);
    const cyan = chalk.rgb(56, 189, 248);
    const green = chalk.rgb(52, 211, 153);
    const amber = chalk.rgb(251, 191, 36);
    const white = chalk.rgb(241, 245, 249);
    const keyBadge = (text: string) => chalk.bgRgb(30, 41, 59).rgb(226, 232, 240)(` ${text} `);

    const model = this.options.model ?? "unconfigured";
    const provider = this.options.provider ?? "unconfigured";
    const cwd = this.options.cwd.length > 44 ? `…${this.options.cwd.slice(-43)}` : this.options.cwd;
    const mcp = this.options.mcpServersCount ?? 0;
    const tools = this.options.toolsCount ?? 0;

    const fit = (value: string): string => {
      const text = truncateToWidth(value, innerWidth);
      return text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
    };

    const row = (value: string): string => border("│") + fit(` ${value}`) + border("│");
    const emptyRow = (): string => border("│") + " ".repeat(innerWidth) + border("│");

    // Header with left brand and right-aligned status
    const headerLeft = `${brand("◆")} ${chalk.bold.white("LOOM AGENT")} ${muted(`v${this.options.version}`)}`;
    const headerRight = green("● ready");
    const headerSpaces = Math.max(2, innerWidth - visibleWidth(headerLeft) - visibleWidth(headerRight) - 2);
    const headerContent = ` ${headerLeft}${" ".repeat(headerSpaces)}${headerRight} `;

    return [
      border("╭" + "─".repeat(innerWidth) + "╮"),
      border("│") + fit(headerContent) + border("│"),
      emptyRow(),
      row(`  ${dim("model")}      ${cyan(model)} ${dim("·")} ${white(provider.toUpperCase())}`),
      row(`  ${dim("workspace")}  ${muted(cwd)}`),
      row(`  ${dim("caps")}       ${cyan(`${tools} tools`)} ${dim("·")} ${mcp ? amber(`${mcp} MCP active`) : dim("MCP none")} ${dim("·")} ${muted("adaptive execution")}`),
      emptyRow(),
      border("├") + divider("─".repeat(innerWidth)) + border("┤"),
      row(`  ${muted("Type a goal to begin")}   ${keyBadge("/")} ${dim("commands")}   ${keyBadge("Shift+Tab")} ${dim("approval mode")}`),
      border("╰" + "─".repeat(innerWidth) + "╯"),
    ];
  }

  invalidate(): void {}
}
