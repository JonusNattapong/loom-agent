import chalk from "chalk";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Component } from "../tui.js";
import { matchesKey } from "../keys.js";
import { visibleWidth } from "../utils.js";

export interface ApiKeyDialogProps {
  providerId: string;
  providerName: string;
  onSuccess: (apiKey: string) => void;
  onCancel: () => void;
}

const PROVIDER_KEY_DOCS: Record<string, { envVar: string; url: string; prefix: string }> = {
  anthropic: { envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys", prefix: "sk-ant-" },
  claude: { envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys", prefix: "sk-ant-" },
  openai: { envVar: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys", prefix: "sk-" },
  google: { envVar: "GEMINI_API_KEY", url: "https://aistudio.google.com/app/apikey", prefix: "AIzaSy" },
  gemini: { envVar: "GEMINI_API_KEY", url: "https://aistudio.google.com/app/apikey", prefix: "AIzaSy" },
  mistral: { envVar: "MISTRAL_API_KEY", url: "https://console.mistral.ai/api-keys", prefix: "" },
  deepseek: { envVar: "DEEPSEEK_API_KEY", url: "https://platform.deepseek.com/api_keys", prefix: "sk-" },
  groq: { envVar: "GROQ_API_KEY", url: "https://console.groq.com/keys", prefix: "gsk_" },
  openrouter: { envVar: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys", prefix: "sk-or-" },
};

export class ApiKeyPromptDialog implements Component {
  private keyBuffer = "";
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

    // Accept pasted characters
    if (data.length > 0 && !data.startsWith("\x1b")) {
      this.keyBuffer += data;
      this.errorMessage = "";
    }
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
      } catch {
        // Fallback gracefully if filesystem write fails
      }
    }

    this.props.onSuccess(apiKey);
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(chalk.bold.white(`Set up ${this.props.providerName} API Key`));
    lines.push(chalk.dim(`Enter your API key to authenticate and unlock ${this.props.providerName} models.`));
    lines.push("");

    // Docs URL
    lines.push(chalk.dim("Get your API key at:"));
    lines.push(`  ${chalk.cyan(this.docsUrl)}`);
    lines.push("");

    // Input Prompt
    lines.push(chalk.bold.white(`API Key (${this.envVarName}):`));
    
    let displayValue = "";
    if (this.keyBuffer.length > 0) {
      if (this.showPlaintext) {
        displayValue = chalk.white(this.keyBuffer);
      } else {
        // Masked key display (show first 3 and last 3 chars if long enough)
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
    lines.push(`  ${displayValue}${cursor}`);
    lines.push("");

    // Options & Keybindings
    const saveToggle = this.savePermanently
      ? chalk.green("● Save permanently to .env")
      : chalk.yellow("○ Session only (temporary)");
    const viewToggle = this.showPlaintext
      ? chalk.cyan("[Hide key]")
      : chalk.dim("[Show key]");

    lines.push(`  ${saveToggle} ${chalk.dim("(Ctrl+S to toggle)")}  ${viewToggle} ${chalk.dim("(Tab to toggle)")}`);
    lines.push("");

    if (this.errorMessage) {
      lines.push(chalk.red(` ⚠ ${this.errorMessage}`));
      lines.push("");
    }

    lines.push(chalk.dim("Enter submit key · Esc cancel"));

    return lines;
  }

  invalidate(): void {}
}
