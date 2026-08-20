import chalk from "chalk";
import type { Component } from "../tui.js";
import { visibleWidth } from "../utils.js";
import type { StatusLineConfig } from "./statusline-dialog.js";

export interface StatusBarOptions {
  model: string;
  cwd: string;
  branch?: string;
  contextUsagePercent?: number;
  totalTokens?: number;
  mcpCount?: number;
  permissionMode?: string;
  runningAgentsCount?: number;
  config?: StatusLineConfig;
}

export class StatusBarView implements Component {
  constructor(private readonly options: StatusBarOptions) {}

  render(width: number): string[] {
    const cfg = this.options.config;
    if (cfg && !cfg.enabled) {
      return [];
    }

    const lines: string[] = [];

    // Top separator
    lines.push(chalk.rgb(55, 65, 81)("─".repeat(Math.max(10, width))));

    const badges: string[] = [];

    if (!cfg || cfg.showModel) {
      if (cfg?.style === "powerline") {
        badges.push(chalk.bgRgb(2, 132, 199).white.bold(` ✦ ${this.options.model} `) + chalk.rgb(2, 132, 199)(""));
      } else {
        badges.push(chalk.bgRgb(2, 132, 199).white.bold(` ✦ ${this.options.model} `));
      }
    }

    if (!cfg || cfg.showCwd) {
      const cwdName = this.options.cwd.split(/[/\\]/).pop() || "project";
      badges.push(chalk.bgRgb(217, 119, 6).black.bold(` 📁 ${cwdName} `));
    }

    if (!cfg || cfg.showBranch) {
      badges.push(chalk.bgRgb(13, 148, 136).white.bold(` ⎇ ${this.options.branch ?? "main"} `));
    }

    if (!cfg || cfg.showContext) {
      const ctxPercent = this.options.contextUsagePercent ?? 8;
      badges.push(chalk.bgRgb(30, 41, 59).white(` ctx ${ctxPercent}% `));
    }

    if ((!cfg || cfg.showTokens) && this.options.totalTokens) {
      badges.push(chalk.dim(`· ${(this.options.totalTokens / 1000).toFixed(1)}k tokens`));
    }

    if ((!cfg || cfg.showMcp) && this.options.mcpCount) {
      badges.push(chalk.dim(`· ${this.options.mcpCount} MCPs`));
    }

    const leftGroup = badges.join(" ");

    // Right hint
    let rightGroup = "";
    if (this.options.runningAgentsCount) {
      rightGroup += chalk.yellow(`← ${this.options.runningAgentsCount} agents `);
    }
    if (!cfg || cfg.showPermissions) {
      rightGroup += chalk.rgb(244, 63, 94)(`▶▶ ${this.options.permissionMode ?? "accept edits on"} (shift+tab to cycle)`);
    }

    const leftVisible = visibleWidth(leftGroup);
    const rightVisible = visibleWidth(rightGroup);
    const gap = Math.max(1, width - leftVisible - rightVisible);

    lines.push(leftGroup + " ".repeat(gap) + rightGroup);
    return lines;
  }

  invalidate(): void {}
}
