import chalk from "chalk";
import { createServer, type Server } from "node:http";
import type { Component } from "../tui.js";
import { matchesKey } from "../keys.js";
import { visibleWidth, truncateToWidth } from "../utils.js";

export interface OAuthLoginOptions {
  providerName: string;
  accountType?: string;
  authUrl?: string;
  onSuccess: (tokenOrKey: string) => void;
  onCancel: () => void;
}

export class OAuthLoginDialog implements Component {
  private server?: Server;
  private inputBuffer = "";
  private isCopied = false;
  private port = 53692;
  private stateCode: string;
  private fullAuthUrl: string;

  constructor(private readonly options: OAuthLoginOptions) {
    this.stateCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const providerKey = options.providerName.toLowerCase();

    if (options.authUrl) {
      this.fullAuthUrl = options.authUrl;
    } else if (providerKey.includes("anthropic") || providerKey.includes("claude")) {
      this.fullAuthUrl = `https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A${this.port}%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference+user%3Asessions%3Aclaude_code+user%3Amcp_servers+user%3Afile_upload&code_challenge=9lwlvkdHOZ4B6eYhhxM1TymPKYsHWUflxhSRekoTZH4&code_challenge_method=S256&state=${this.stateCode}`;
    } else if (providerKey.includes("google") || providerKey.includes("gemini")) {
      this.fullAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=google-loom-agent&redirect_uri=http%3A%2F%2Flocalhost%3A${this.port}%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgenerative-language&state=${this.stateCode}`;
    } else {
      this.fullAuthUrl = `https://api.openai.com/oauth/authorize?client_id=loom-agent&redirect_uri=http%3A%2F%2Flocalhost%3A${this.port}%2Fcallback&response_type=code&state=${this.stateCode}`;
    }

    this.startLocalServer();
  }

  private startLocalServer(): void {
    try {
      this.server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
        const code = url.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h1>Authentication Successful!</h1><p>You can return to Loom Terminal now.</p>");
          this.cleanup();
          this.options.onSuccess(code);
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code");
        }
      });

      this.server.listen(this.port, "localhost").on("error", () => {
        // Port conflict, fallback to manual code paste
      });
    } catch {
      // Fallback to manual
    }
  }

  private cleanup(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = undefined;
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.cleanup();
      this.options.onCancel();
      return;
    }

    if (matchesKey(data, "alt+c") || data === "\x1bc") {
      this.isCopied = true;
      return;
    }

    if (matchesKey(data, "return") || matchesKey(data, "enter")) {
      if (this.inputBuffer.trim()) {
        this.cleanup();
        this.options.onSuccess(this.inputBuffer.trim());
      }
      return;
    }

    if (matchesKey(data, "backspace")) {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
      }
      return;
    }

    // Accept pasted characters
    if (data.length > 0 && !data.startsWith("\x1b")) {
      this.inputBuffer += data;
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const providerTitle = `${this.options.providerName} (${this.options.accountType ?? "Claude Pro/Max"})`;

    // 1. Header
    lines.push(chalk.bold.white(`Login to ${providerTitle}`));
    lines.push(chalk.dim("Complete this step to continue setup."));
    lines.push("");

    // 2. Browser sign-in section
    lines.push(chalk.bold.white("Browser sign-in"));
    lines.push(chalk.dim("The sign-in page should already be opening. If it did not open, use the link below."));
    lines.push("");

    // 3. Sign-in link
    lines.push(chalk.bold.white("Sign-in link"));
    lines.push(chalk.dim(this.fullAuthUrl));
    lines.push(
      chalk.dim("Alt+C copy") +
      (this.isCopied ? chalk.green(" (Copied to clipboard!) ") : "  ") +
      chalk.dim("·  Esc/Ctrl+C cancel")
    );
    lines.push("");

    // 4. Next step
    lines.push(chalk.bold.white("Next step"));
    lines.push(chalk.dim("Complete login in your browser. If the browser is on another machine, paste the final redirect URL here."));
    lines.push("");

    // 5. Manual fallback
    lines.push(chalk.bold.white("Manual fallback"));
    lines.push(chalk.dim("Paste redirect URL below, or complete login in browser:"));

    const inputDisplay = this.inputBuffer
      ? `${chalk.white(this.inputBuffer)}${chalk.bgWhite.black(" ")}`
      : chalk.bgWhite.black(" ");
    lines.push(` ${inputDisplay}`);
    lines.push("");
    lines.push(chalk.dim("Esc/Ctrl+C cancel"));

    return lines;
  }

  invalidate(): void {}
}
