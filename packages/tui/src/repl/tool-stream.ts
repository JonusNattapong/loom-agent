import chalk from "chalk";
import type { Component } from "../tui.js";

export interface ToolStreamEvent {
  tool: string;
  summary: string;
  linesIn?: number;
  linesOut?: number;
  durationMs: number;
  type: "tool" | "a2a_message" | "system";
  targetAgent?: string;
  status: "success" | "running" | "error";
}

export class ToolStreamView implements Component {
  constructor(private readonly events: ToolStreamEvent[]) {}

  render(width: number): string[] {
    const lines: string[] = [];

    for (const evt of this.events) {
      const durationStr = evt.durationMs >= 1000 
        ? `${(evt.durationMs / 1000).toFixed(1)}s` 
        : `${evt.durationMs}ms`;

      if (evt.type === "a2a_message") {
        // A2A Message line: ◆ Agent message queued • to child <id> • <preview> • (Ctrl+O to expand)
        const symbol = chalk.rgb(168, 85, 247)("◆");
        const title = chalk.rgb(192, 132, 252)("Agent message queued");
        const target = evt.targetAgent ? chalk.dim(`• to child `) + chalk.cyan(evt.targetAgent) + " " : "";
        const summary = chalk.gray(evt.summary.length > 50 ? evt.summary.slice(0, 47) + "..." : evt.summary);
        const expandHint = chalk.dim(" • (Ctrl+O to expand)");

        lines.push(`${symbol} ${title} ${target}• ${summary}${expandHint}`);
      } else {
        // Standard Tool line: ✓ python/shell • <code/cmd> • ↑ X ↓ Y lines • <duration>
        const icon = evt.status === "success" 
          ? chalk.green("✓") 
          : evt.status === "error" 
            ? chalk.red("×") 
            : chalk.cyan("▶");

        const toolName = chalk.rgb(139, 92, 246)(evt.tool);
        const codeSnippet = chalk.dim(evt.summary.length > 55 ? evt.summary.slice(0, 52) + "..." : evt.summary);
        
        const linesInfo = (evt.linesIn !== undefined || evt.linesOut !== undefined)
          ? chalk.dim(`• ↑ ${evt.linesIn ?? 1} ↓ ${evt.linesOut ?? 1} lines `)
          : "";

        const duration = chalk.dim(`• ${durationStr}`);

        lines.push(`${icon} ${toolName} • ${codeSnippet} ${linesInfo}${duration}`);
      }
    }

    return lines;
  }

  invalidate(): void {}
}
