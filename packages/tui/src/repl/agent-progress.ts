import chalk from "chalk";
import type { Component } from "../tui.js";

export interface ProgressTaskItem {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked" | "needs_approval";
  role?: string;
  duration?: string;
  toolCallName?: string;
  toolCount?: number;
}

export interface MultiAgentProgressProps {
  goal: string;
  agentId: string;
  tasks: ProgressTaskItem[];
  parallelCount?: number;
}

export class MultiAgentProgressView implements Component {
  constructor(private readonly props: MultiAgentProgressProps) {}

  render(_width: number): string[] {
    const parallel = this.props.parallelCount ? ` · ${this.props.parallelCount} parallel` : "";
    const lines = [chalk.bold.cyan("▾ Execution plan") + chalk.dim(" · Autonomous Multi-Agent Plan") + chalk.dim(parallel)];
    lines.push(chalk.dim(`  ${this.props.agentId} · root planner`));
    for (let i = 0; i < this.props.tasks.length; i++) {
      const task = this.props.tasks[i];
      const branch = i === this.props.tasks.length - 1 ? "  └─" : "  ├─";
      let icon = chalk.dim("○");
      let title = chalk.white(task.title);
      if (task.status === "completed") { icon = chalk.green("✓"); title = chalk.dim(task.title); }
      if (task.status === "running") { icon = chalk.bold.cyan("●"); title = chalk.bold.white(task.title); }
      if (task.status === "needs_approval") { icon = chalk.bold.yellow("?"); title = chalk.bold.yellow(task.title); }
      if (task.status === "failed") { icon = chalk.bold.red("×"); title = chalk.bold.red(task.title); }
      if (task.status === "blocked") { icon = chalk.bold.yellow("!"); title = chalk.yellow(task.title); }
      const role = task.role ? chalk.dim(` ${task.role}`) : "";
      const duration = task.duration ? chalk.dim(` · ${task.duration}`) : "";
      const tool = task.toolCallName ? chalk.magenta(` · ${task.toolCallName}`) : "";
      lines.push(`${chalk.dim(branch)} ${icon} ${title}${role}${duration}${tool}`);
    }
    return lines;
  }

  invalidate(): void {}
}
