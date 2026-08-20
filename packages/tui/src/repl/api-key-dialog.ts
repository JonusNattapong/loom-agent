import chalk from "chalk";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Component } from "../tui.js";
import { matchesKey } from "../keys.js";
import { visibleWidth, truncateToWidth } from "../utils.js";

export interface ApiKeyDialogProps {
  providerId: string;
  providerName: string;
  onSuccess: (apiKey: string) => void;
  onCancel: () => void;
}

const PROVIDER_KEY_DOCS: Record<string, { envVar: string; url: string; prefix: string }> = {
  opencode: { envVar: "OPENCODE_API_KEY", url: "https://opencode.ai / Local SDK config", prefix: "" },
  anthropic: { envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys", prefix: "sk-ant-" },
  claude: { envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys", prefix: "sk-ant-" },
  openai: { envVar: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys", prefix: "sk-" },
  google: { envVar: "GEMINI_API_KEY", url: "https://aistudio.google.com/app/apikey", prefix: "AIzaSy" },
  gemini: { envVar: "GEMINI_API_KEY", url: "https://aistudio.google.com/app/apikey", prefix: "AIzaSy" },
  mistral: { envVar: "MISTRAL_API_KEY", url: "https://console.mistral.ai/api-keys", prefix: "" },
  deepseek: { envVar: "DEEPSEEK_API_KEY", url: "https://platform.deepseek.com/api_keys", prefix: "sk-" },
  groq: { envVar: "GROQ_API_KEY", url: "https://console.groq.com/keys", prefix: "gsk_" },
  openrouter: { envVar: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", prefix: "sk-or-" },
  ollama: { envVar: "OPENAI_BASE_URL", url: "http://localhost:11434/v1", prefix: "http" },
};

export class ApiKeyPromptDialog implements Component {
  /** TUI focus marker; modal input must own the active terminal focus. */
  focused = false;
  private keyBuffer = "";
  private pasteBuffer = "";
  private showPlaintext = false;
  private savePermanently = true;
  private errorMessage = "";
  private envVarName: string;
  private docsUrl: string;

  constructor(private readonly props: ApiKeyDialogProps) {
    const meta = PROVIDER_KEY_DOCS[props.providerId.toLowerCase()] ?? {
      envVar: `${props.providerId.toUpperCase()}_API_KEY`,
      url: "https://loom.dev/docs/providers",
      prefix: "",
    };
    this.envVarName = meta.envVar;
    this.docsUrl = meta.url;
  }

  handleInput(data: string): void {
    // Windows Terminal and modern shells wrap clipboard input in bracketed
    // paste markers. Handle those before rejecting escape-prefixed sequences.
    const pasteStart = "\x1b[200~";
    const pasteEnd = "\x1b[201~";
    if (this.pasteBuffer || data.includes(pasteStart)) {
      const started = this.pasteBuffer ? data : data.slice(data.indexOf(pasteStart) + pasteStart.length);
      this.pasteBuffer += started;
      const end = this.pasteBuffer.indexOf(pasteEnd);
      if (end === -1) return;
      const pasted = this.pasteBuffer.slice(0, end);
      this.pasteBuffer = "";
      this.appendPastedText(pasted);
      const remaining = data.slice(data.lastIndexOf(pasteEnd) + pasteEnd.length);
      if (remaining) this.handleInput(remaining);
      return;
    }

    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.props.onCancel();
      return;
    }

    if (matchesKey(data, "tab")) {
      this.showPlaintext = !this.showPlaintext;
      return;
    }

    if (matchesKey(data, "ctrl+s")) {
      this.savePermanently = !this.savePermanently;
      return;
    }

    if (matchesKey(data, "return") || matchesKey(data, "enter")) {
      const trimmed = this.keyBuffer.trim();
      if (!trimmed) {
        this.errorMessage = "API key cannot be empty.";
        return;
      }
      void this.saveAndSubmit(trimmed);
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.keyBuffer.length > 0) {
        this.keyBuffer = this.keyBuffer.slice(0, -1);
        this.errorMessage = "";
      }
      return;
    }

    // Accept plain pasted characters from terminals without bracketed paste.
    if (data.length > 0 && !data.startsWith("\x1b")) {
      this.appendPastedText(data);
    }
  }

  private appendPastedText(text: string): void {
    const clean = text.replace(/[\r\n\u0000-\u001f\u007f]/g, "");
    if (!clean) return;
    this.keyBuffer += clean;
    this.errorMessage = "";
  }

  private async saveAndSubmit(apiKey: string): Promise<void> {
    // Set in runtime process.env
    process.env[this.envVarName] = apiKey;

    if (this.savePermanently) {
      try {
        // Persist to .env file in workspace
        const envPath = join(process.cwd(), ".env");
        let envContent = "";
        try {
          envContent = await fs.readFile(envPath, "utf8");
        } catch {}

        const lineRegex = new RegExp(`^${this.envVarName}=.*$`, "m");
        if (lineRegex.test(envContent)) {
          envContent = envContent.replace(lineRegex, `${this.envVarName}=${apiKey}`);
        } else {
          envContent = `${envContent.trim()}\n${this.envVarName}=${apiKey}\n`;
        }
        await fs.writeFile(envPath, envContent.trim() + "\n", "utf8");

        // Keep the selected provider aligned with the key across restarts.
        const configPath = join(process.cwd(), ".loom", "config.json");
        try {
          const config = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
          const provider = typeof config.provider === "object" && config.provider !== null
            ? config.provider as Record<string, unknown>
            : {};
          config.provider = { ...provider, id: this.props.providerId };
          await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
        } catch {
          // Config may not exist yet; the in-process provider switch still works.
        }
      } catch {
        // Fallback gracefully if filesystem write fails
      }
    }

    this.props.onSuccess(apiKey);
  }

  render(width: number): string[] {
    const cardWidth = Math.min(Math.max(width, 50), 92);
    const innerWidth = cardWidth - 2;
    const border = chalk.rgb(71, 85, 105);
    const divider = chalk.rgb(51, 65, 85);
    const dim = chalk.rgb(100, 116, 139);
    const muted = chalk.rgb(148, 163, 184);
    const cyan = chalk.rgb(56, 189, 248);

    const fit = (value: string): string => {
      const text = truncateToWidth(value, innerWidth);
      return text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
    };

    const row = (value = ""): string => border("│") + fit(value ? ` ${value}` : "") + border("│");
    const emptyRow = (): string => border("│") + " ".repeat(innerWidth) + border("│");

    const lines: string[] = [];
    lines.push(border("╭" + "─".repeat(innerWidth) + "╮"));
    lines.push(row(`${chalk.bold.rgb(167, 139, 250)("◆")} ${chalk.bold.white(`Set up ${this.props.providerName} API Key`)}`));
    lines.push(row(`${muted(`Enter your API key to authenticate and unlock ${this.props.providerName} models.`)}`));
    lines.push(emptyRow());

    lines.push(row(`${dim("Get your API key at:")}`));
    lines.push(row(`  ${cyan(this.docsUrl)}`));
    lines.push(emptyRow());

    lines.push(row(`${chalk.bold.white(`API Key (${this.envVarName}):`)}`));

    let displayValue = "";
    if (this.keyBuffer.length > 0) {
      if (this.showPlaintext) {
        displayValue = chalk.white(this.keyBuffer);
      } else {
        if (this.keyBuffer.length > 8) {
          const start = this.keyBuffer.slice(0, 4);
          const end = this.keyBuffer.slice(-3);
          const masked = "•".repeat(this.keyBuffer.length - 7);
          displayValue = chalk.cyan(start) + chalk.dim(masked) + chalk.cyan(end);
        } else {
          displayValue = chalk.dim("•".repeat(this.keyBuffer.length));
        }
      }
    }

    const cursor = chalk.bgWhite.black(" ");
    lines.push(row(`  ${displayValue}${cursor}`));
    lines.push(emptyRow());

    const saveToggle = this.savePermanently
      ? chalk.green("● Save permanently to .env")
      : chalk.yellow("○ Session only (temporary)");
    const viewToggle = this.showPlaintext
      ? chalk.cyan("[Hide key]")
      : chalk.dim("[Show key]");

    lines.push(row(`  ${saveToggle} ${dim("(Ctrl+S)")}   ${viewToggle} ${dim("(Tab)")}`));

    if (this.errorMessage) {
      lines.push(row(`  ${chalk.red(`⚠ ${this.errorMessage}`)}`));
    }

    lines.push(border("├" + divider("─".repeat(innerWidth)) + "┤"));
    lines.push(row(`  ${chalk.dim("Enter submit key")}   ${chalk.dim("·   Esc cancel")}`));
    lines.push(border("╰" + "─".repeat(innerWidth) + "╯"));

    return lines;
  }

  invalidate(): void {}
}
