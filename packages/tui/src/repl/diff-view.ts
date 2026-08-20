import chalk from "chalk";
import type { Component } from "../tui.js";

export interface FileDiffProps {
  filePath: string;
  operation: "modified" | "created" | "deleted";
  linesAdded?: number;
  linesRemoved?: number;
  diffText?: string;
  diagnosticsCount?: number;
}

export class DiffExecutionView implements Component {
  constructor(private readonly props: FileDiffProps) {}

  render(width: number): string[] {
    const lines: string[] = [];
    const opColor = this.props.operation === "created" ? chalk.green : this.props.operation === "deleted" ? chalk.red : chalk.cyan;
    const opSymbol = "●";

    // Header line: ● Update(crates\cust-tools\src\bash.rs)
    lines.push(
      opColor(`${opSymbol} ${this.props.operation === "created" ? "Create" : "Update"}`) +
      chalk.bold(`(${this.props.filePath})`)
    );

    // Stats line: └ Added X lines, removed Y lines
    if (this.props.linesAdded !== undefined || this.props.linesRemoved !== undefined) {
      const added = chalk.green(`Added ${this.props.linesAdded ?? 0} line${this.props.linesAdded === 1 ? "" : "s"}`);
      const removed = chalk.red(`removed ${this.props.linesRemoved ?? 0} line${this.props.linesRemoved === 1 ? "" : "s"}`);
      lines.push(chalk.dim("  └ ") + `${added}, ${removed}`);
    }

    // Render Diff content if present
    if (this.props.diffText) {
      const diffLines = this.props.diffText.split("\n");
      let lineNum = 1;

      for (const line of diffLines) {
        if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
          lines.push(chalk.dim("      " + line));
          continue;
        }

        const numStr = String(lineNum).padStart(4, " ");
        if (line.startsWith("-")) {
          // Removed line (red background, white text)
          lines.push(chalk.dim(numStr) + " " + chalk.bgRgb(127, 29, 29).white(` - ${line.slice(1)}`));
          lineNum++;
        } else if (line.startsWith("+")) {
          // Added line (green background, white text)
          lines.push(chalk.dim(numStr) + " " + chalk.bgRgb(20, 83, 45).white(` + ${line.slice(1)}`));
          lineNum++;
        } else {
          // Context line
          lines.push(chalk.dim(numStr) + chalk.dim(`   ${line.startsWith(" ") ? line.slice(1) : line}`));
          lineNum++;
        }
      }
    }

    // Diagnostic summary if any
    if (this.props.diagnosticsCount !== undefined) {
      if (this.props.diagnosticsCount === 0) {
        lines.push(chalk.dim("  └ ") + chalk.green("✔ All diagnostic checks passed"));
      } else {
        lines.push(chalk.dim("  └ ") + chalk.yellow(`Found ${this.props.diagnosticsCount} diagnostic issues (run verification)`));
      }
    }

    return lines;
  }

  invalidate(): void {}
}
