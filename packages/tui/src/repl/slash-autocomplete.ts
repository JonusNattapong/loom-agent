import chalk from "chalk";
import Fuse from "fuse.js";
import type { Component } from "../tui.js";
import { visibleWidth, truncateToWidth } from "../utils.js";

export interface SlashCommandItem {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
}

export const DEFAULT_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    name: "/help",
    description: "Show command reference and available options",
  },
  {
    name: "/status",
    description: "Show Loom Agent status including version, model, API connectivity, and tool statuses",
    aliases: ["status"],
  },
  {
    name: "/statusline",
    description: "Set up Loom's status line UI layout and badges",
    aliases: ["statusline", "st"],
  },
  {
    name: "/plan",
    description: "Inspect current multi-agent task graph and execution progress",
  },
  {
    name: "/doctor",
    description: "Run system and configuration diagnostic checks",
  },
  {
    name: "/tools",
    description: "List all registered native and MCP tools",
  },
  {
    name: "/skills",
    description: "List discovered agent skills in workspace",
  },
  {
    name: "/usage",
    description: "Show session cost, token usage, and activity statistics",
    aliases: ["stats"],
  },
  {
    name: "/mcp",
    description: "Manage MCP server connections and inspect tool schemas",
  },
  {
    name: "/model",
    description: "Switch active LLM model or provider (Claude, Gemini, OpenAI, Mistral)",
  },
  {
    name: "/btw",
    description: "Ask a quick side question without interrupting agent",
  },
  {
    name: "/clear",
    description: "Clear transcript and re-render header",
  },
  {
    name: "/exit",
    description: "Exit REPL session",
    aliases: ["quit"],
  },
];

export class SlashAutocompleteView implements Component {
  private fuse: Fuse<SlashCommandItem>;
  private filteredItems: { item: SlashCommandItem; matches?: readonly any[] }[] = [];
  public selectedIndex = 0;

  constructor(
    private readonly commands: SlashCommandItem[] = DEFAULT_SLASH_COMMANDS,
    private readonly maxVisible = 6
  ) {
    this.fuse = new Fuse(this.commands, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "aliases", weight: 0.25 },
        { name: "description", weight: 0.15 },
      ],
      threshold: 0.45,
      includeMatches: true,
      minMatchCharLength: 1,
    });
    this.updateQuery("");
  }

  updateQuery(query: string): void {
    const cleanQuery = query.startsWith("/") ? query : `/${query}`;
    if (cleanQuery === "/" || cleanQuery.trim() === "") {
      this.filteredItems = this.commands.slice(0, this.maxVisible).map((item) => ({ item }));
    } else {
      const results = this.fuse.search(cleanQuery);
      this.filteredItems = results.slice(0, this.maxVisible).map((res) => ({
        item: res.item,
        matches: res.matches,
      }));
    }
    if (this.selectedIndex >= this.filteredItems.length) {
      this.selectedIndex = Math.max(0, this.filteredItems.length - 1);
    }
  }

  get hasMatches(): boolean {
    return this.filteredItems.length > 0;
  }

  getSelectedCommand(): SlashCommandItem | undefined {
    return this.filteredItems[this.selectedIndex]?.item;
  }

  selectNext(): void {
    if (this.filteredItems.length > 0) {
      this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
    }
  }

  selectPrev(): void {
    if (this.filteredItems.length > 0) {
      this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    }
  }

  private highlightMatches(text: string, matches?: readonly any[], keyName = "name"): string {
    if (!matches || matches.length === 0) return text;
    const match = matches.find((m) => m.key === keyName);
    if (!match || !match.indices || match.indices.length === 0) return text;

    const chars = Array.from(text);
    const highlighted = new Set<number>();
    for (const [start, end] of match.indices) {
      for (let i = start; i <= end; i++) {
        highlighted.add(i);
      }
    }

    return chars
      .map((ch, idx) => (highlighted.has(idx) ? chalk.bold.white(ch) : chalk.rgb(129, 140, 248)(ch)))
      .join("");
  }

  render(width: number): string[] {
    if (this.filteredItems.length === 0) return [];

    const lines: string[] = [];
    const nameColWidth = 24;

    for (let i = 0; i < this.filteredItems.length; i++) {
      const { item, matches } = this.filteredItems[i];
      const isSelected = i === this.selectedIndex;

      const aliasStr = item.aliases && item.aliases.length > 0 ? ` (${item.aliases.join(", ")})` : "";
      const rawName = `${item.name}${aliasStr}`;
      const styledName = this.highlightMatches(rawName, matches, "name");

      const visibleNameLen = visibleWidth(rawName);
      const namePadding = Math.max(1, nameColWidth - visibleNameLen);
      const nameCol = styledName + " ".repeat(namePadding);

      const maxDescWidth = Math.max(10, width - nameColWidth - 4);
      const desc = truncateToWidth(item.description, maxDescWidth);
      const descCol = chalk.gray(desc);

      if (isSelected) {
        // Selected row highlighted with cyan prefix or background
        const pad = Math.max(1, namePadding);
        lines.push(
          chalk.cyan("› ") + chalk.bold.cyan(rawName) + " ".repeat(pad) + chalk.white(desc)
        );
      } else {
        lines.push(`  ${nameCol}${descCol}`);
      }
    }

    return lines;
  }

  invalidate(): void {}
}
