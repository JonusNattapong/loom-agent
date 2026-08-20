import chalk from "chalk";
import type { Component } from "../tui.js";
import { SelectList, type SelectItem } from "../components/select-list.js";
import { Box } from "../components/box.js";
import { Text } from "../components/text.js";
import { Spacer } from "../components/spacer.js";
import { defaultSelectListTheme } from "./theme.js";

export interface StatusLineConfig {
  enabled: boolean;
  style: "full" | "compact" | "minimal" | "powerline";
  showModel: boolean;
  showCwd: boolean;
  showBranch: boolean;
  showContext: boolean;
  showTokens: boolean;
  showMcp: boolean;
  showPermissions: boolean;
}

export const DEFAULT_STATUS_LINE_CONFIG: StatusLineConfig = {
  // Keep the first screen quiet. Users can enable a preset from /statusline.
  enabled: false,
  style: "full",
  showModel: true,
  showCwd: true,
  showBranch: true,
  showContext: true,
  showTokens: true,
  showMcp: true,
  showPermissions: true,
};

export class StatusLineConfigDialog implements Component {
  private box: Box;
  private selectList: SelectList;

  constructor(
    private currentConfig: StatusLineConfig,
    private readonly onSelect: (config: StatusLineConfig) => void,
    private readonly onCancel: () => void
  ) {
    this.box = new Box(1, 1);

    const items: SelectItem[] = [
      {
        value: "preset_full",
        label: chalk.bold.cyan("✦ Full (Default)"),
        description: "Model, CWD, Branch, Context %, Tokens, MCPs, Permissions",
      },
      {
        value: "preset_compact",
        label: chalk.bold.yellow("⚡ Compact"),
        description: "Model, Branch, Context %, Permissions",
      },
      {
        value: "preset_minimal",
        label: chalk.bold.green("● Minimal"),
        description: "Model, Context % only",
      },
      {
        value: "preset_powerline",
        label: chalk.bold.magenta(" Powerline"),
        description: "Arrow-separated powerline styling",
      },
      {
        value: "toggle_cwd",
        label: `${currentConfig.showCwd ? "✔" : "○"} Toggle CWD Directory`,
        description: `Currently: ${currentConfig.showCwd ? "Visible" : "Hidden"}`,
      },
      {
        value: "toggle_branch",
        label: `${currentConfig.showBranch ? "✔" : "○"} Toggle Git Branch`,
        description: `Currently: ${currentConfig.showBranch ? "Visible" : "Hidden"}`,
      },
      {
        value: "toggle_tokens",
        label: `${currentConfig.showTokens ? "✔" : "○"} Toggle Token Counter`,
        description: `Currently: ${currentConfig.showTokens ? "Visible" : "Hidden"}`,
      },
      {
        value: "toggle_mcp",
        label: `${currentConfig.showMcp ? "✔" : "○"} Toggle MCP Indicator`,
        description: `Currently: ${currentConfig.showMcp ? "Visible" : "Hidden"}`,
      },
      {
        value: "preset_off",
        label: chalk.red("✖ Disable Status Line"),
        description: "Hide the bottom status line completely",
      },
    ];

    this.selectList = new SelectList(items, 6, defaultSelectListTheme);
    this.selectList.onSelect = (item) => {
      const updated = { ...this.currentConfig };
      if (item.value === "preset_full") {
        Object.assign(updated, DEFAULT_STATUS_LINE_CONFIG, { enabled: true, style: "full" });
      } else if (item.value === "preset_compact") {
        Object.assign(updated, {
          enabled: true,
          style: "compact",
          showModel: true,
          showCwd: false,
          showBranch: true,
          showContext: true,
          showTokens: false,
          showMcp: false,
          showPermissions: true,
        });
      } else if (item.value === "preset_minimal") {
        Object.assign(updated, {
          enabled: true,
          style: "minimal",
          showModel: true,
          showCwd: false,
          showBranch: false,
          showContext: true,
          showTokens: false,
          showMcp: false,
          showPermissions: false,
        });
      } else if (item.value === "preset_powerline") {
        Object.assign(updated, DEFAULT_STATUS_LINE_CONFIG, { enabled: true, style: "powerline" });
      } else if (item.value === "preset_off") {
        updated.enabled = false;
      } else if (item.value === "toggle_cwd") {
        updated.showCwd = !updated.showCwd;
      } else if (item.value === "toggle_branch") {
        updated.showBranch = !updated.showBranch;
      } else if (item.value === "toggle_tokens") {
        updated.showTokens = !updated.showTokens;
      } else if (item.value === "toggle_mcp") {
        updated.showMcp = !updated.showMcp;
      }
      this.onSelect(updated);
    };

    this.selectList.onCancel = () => {
      this.onCancel();
    };

    this.box.addChild(new Text(chalk.bold.cyan("⚙ Status Line Configuration (Claude Code Style)")));
    this.box.addChild(new Text(chalk.dim("Select a layout preset or toggle individual badge items:")));
    this.box.addChild(new Spacer(1));
    this.box.addChild(this.selectList);
    this.box.addChild(new Spacer(1));
    this.box.addChild(new Text(chalk.dim("Use Arrow Keys to navigate, Enter to apply, Esc to cancel")));
  }

  handleInput(data: string): void {
    this.selectList.handleInput(data);
  }

  render(width: number): string[] {
    return this.box.render(width);
  }

  invalidate(): void {
    this.box.invalidate();
    this.selectList.invalidate();
  }
}
