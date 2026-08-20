import chalk from "chalk";
import type { Component } from "../tui.js";
import { SelectList, type SelectItem } from "../components/select-list.js";
import { Box } from "../components/box.js";
import { Text } from "../components/text.js";
import { Spacer } from "../components/spacer.js";
import { defaultSelectListTheme } from "./theme.js";

export interface ApprovalRequest {
  id: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
}

export type ApprovalDecision = "approved" | "denied";

export class ApprovalDialog implements Component {
  private box: Box;
  private selectList: SelectList;

  constructor(
    public readonly request: ApprovalRequest,
    private readonly onDecision: (decision: ApprovalDecision) => void
  ) {
    this.box = new Box(1, 1);

    const items: SelectItem[] = [
      {
        value: "approve",
        label: chalk.green("✔ Approve this execution"),
        description: "Allow the agent to run this tool once",
      },
      {
        value: "deny",
        label: chalk.red("✖ Deny execution"),
        description: "Reject tool execution and return permission error",
      },
    ];

    this.selectList = new SelectList(items, 2, defaultSelectListTheme);
    this.selectList.onSelect = (selected) => {
      this.onDecision(selected.value === "approve" ? "approved" : "denied");
    };

    this.box.addChild(new Text(chalk.bold.yellow("⚠️  Tool Approval Required")));
    this.box.addChild(new Text(chalk.bold(`Agent: `) + chalk.cyan(request.agentId)));
    this.box.addChild(new Text(chalk.bold(`Tool: `) + chalk.magenta(request.toolName)));
    this.box.addChild(
      new Text(chalk.bold(`Parameters:\n`) + chalk.gray(JSON.stringify(request.input, null, 2)))
    );
    if (request.reason) {
      this.box.addChild(new Text(chalk.bold(`Reason: `) + chalk.italic(request.reason)));
    }
    this.box.addChild(new Spacer(1));
    this.box.addChild(new Text(chalk.dim("Use Arrow Keys to select, Enter to confirm:")));
    this.box.addChild(this.selectList);
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
