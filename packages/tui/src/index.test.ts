import { describe, it, expect } from "vitest";
import {
  Box,
  Text,
  Spacer,
  Markdown,
  SelectList,
  ApprovalDialog,
  LoomWelcomeCard,
  DiffExecutionView,
  MultiAgentProgressView,
  StatusBarView,
  ToolStreamView,
  StatusLineConfigDialog,
  DEFAULT_STATUS_LINE_CONFIG,
  SlashAutocompleteView,
  SettingsMultiTabDialog,
  OAuthLoginDialog,
  ApiKeyPromptDialog,
  CombinedAutocompleteProvider,
  defaultSelectListTheme,
  defaultMarkdownTheme,
} from "./index.js";

describe("@loom-agent/tui", () => {
  it("renders text component properly", () => {
    const text = new Text("Hello Loom TUI");
    const lines = text.render(40);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("Hello Loom TUI");
  });

  it("renders box container with padding", () => {
    const box = new Box(1, 1);
    box.addChild(new Text("Inside Box"));
    const lines = box.render(40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("\n")).toContain("Inside Box");
  });

  it("renders markdown component", () => {
    const md = new Markdown("# Header 1\n- Item A\n- Item B", 0, 0, defaultMarkdownTheme);
    const lines = md.render(60);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("Header 1");
  });

  it("renders select list items", () => {
    const items = [
      { value: "opt1", label: "Option 1" },
      { value: "opt2", label: "Option 2" },
    ];
    const select = new SelectList(items, 5, defaultSelectListTheme);
    const lines = select.render(50);
    expect(lines.join("\n")).toContain("Option 1");
  });

  it("creates approval dialog and handles decisions", () => {
    let decisionResult: string | undefined;
    const dialog = new ApprovalDialog(
      {
        id: "req_1",
        agentId: "agent_123",
        toolName: "shell",
        input: { command: "rm -rf /" },
        reason: "Dangerous command",
      },
      (decision) => {
        decisionResult = decision;
      }
    );

    const lines = dialog.render(80);
    expect(lines.join("\n")).toContain("Tool Approval Required");
    expect(lines.join("\n")).toContain("agent_123");
    expect(lines.join("\n")).toContain("shell");
  });

  it("renders modern LoomWelcomeCard with pixel mascot", () => {
    const card = new LoomWelcomeCard({
      version: "1.1.0",
      model: "claude-3-7-sonnet",
      provider: "anthropic",
      cwd: "/workspace/loom",
      mcpServersCount: 3,
      toolsCount: 14,
    });
    const lines = card.render(80);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join("\n")).toContain("LOOM AGENT");
    expect(lines.join("\n")).toContain("ANTHROPIC");
  });

  it("renders DiffExecutionView with color highlighting", () => {
    const diff = new DiffExecutionView({
      filePath: "src/index.ts",
      operation: "modified",
      linesAdded: 2,
      linesRemoved: 1,
      diffText: "- old line\n+ new line",
      diagnosticsCount: 0,
    });
    const lines = diff.render(80);
    expect(lines.join("\n")).toContain("Update(src/index.ts)");
    expect(lines.join("\n")).toContain("Added 2 lines");
  });

  it("renders MultiAgentProgressView task hierarchy", () => {
    const view = new MultiAgentProgressView({
      goal: "Scan and refactor code",
      agentId: "root_agent",
      tasks: [
        { id: "1", title: "Find dead code", status: "completed", duration: "12s" },
        { id: "2", title: "Fix duplicate blocks", status: "running", duration: "25s", toolCallName: "replace_file_content" },
      ],
      parallelCount: 2,
    });
    const lines = view.render(80);
    expect(lines.join("\n")).toContain("Autonomous Multi-Agent Plan");
    expect(lines.join("\n")).toContain("Find dead code");
    expect(lines.join("\n")).toContain("Fix duplicate blocks");
  });

  it("renders StatusBarView badges and keybinding hint", () => {
    const statusBar = new StatusBarView({
      model: "claude-3-7",
      cwd: "/home/user/loom",
      branch: "main",
      contextUsagePercent: 12,
      totalTokens: 45000,
      mcpCount: 3,
      permissionMode: "accept edits on",
    });
    const lines = statusBar.render(100);
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("claude-3-7");
    expect(lines[1]).toContain("loom");
    expect(lines[1]).toContain("accept edits on");
  });

  it("keeps the default status line quiet until a preset is enabled", () => {
    const statusBar = new StatusBarView({
      model: "gpt-4o",
      cwd: process.cwd(),
      config: DEFAULT_STATUS_LINE_CONFIG,
    });
    expect(statusBar.render(80)).toEqual([]);
  });

  it("renders ToolStreamView tool execution lines and a2a messages", () => {
    const stream = new ToolStreamView([
      {
        tool: "python",
        summary: "fp.write_text(s)",
        linesIn: 8,
        linesOut: 1,
        durationMs: 273,
        type: "tool",
        status: "success",
      },
      {
        tool: "a2a",
        summary: "Current cargo check errors: tiberius Cl...",
        durationMs: 7100,
        type: "a2a_message",
        targetAgent: "legacy-write-api-port",
        status: "success",
      },
    ]);
    const lines = stream.render(100);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("python • fp.write_text(s)");
    expect(lines[0]).toContain("273ms");
    expect(lines[1]).toContain("Agent message queued");
    expect(lines[1]).toContain("legacy-write-api-port");
  });

  it("renders StatusLineConfigDialog and handles presets", () => {
    let chosenConfig: any;
    const dialog = new StatusLineConfigDialog(
      DEFAULT_STATUS_LINE_CONFIG,
      (cfg) => {
        chosenConfig = cfg;
      },
      () => {}
    );
    const lines = dialog.render(80);
    expect(lines.join("\n")).toContain("Status Line Configuration");
    expect(lines.join("\n")).toContain("Full (Default)");
  });

  it("renders SlashAutocompleteView and fuzzy matches /st with Fuse.js", () => {
    const view = new SlashAutocompleteView();
    view.updateQuery("/st");
    const lines = view.render(80);
    expect(lines.length).toBeGreaterThan(0);
    const text = lines.join("\n");
    expect(text).toContain("/status");
    expect(text).toContain("/statusline");
  });

  it("applies slash command completions without duplicating the slash", () => {
    const provider = new CombinedAutocompleteProvider(
      [{ name: "/help", description: "Show help" }],
      process.cwd(),
    );
    const result = provider.applyCompletion(
      ["/he"],
      0,
      3,
      { value: "/help", label: "/help" },
      "/he",
    );
    expect(result.lines[0]).toBe("/help ");
    expect(result.cursorCol).toBe(6);
  });

  it("renders SettingsMultiTabDialog across tabs", () => {
    const dialog = new SettingsMultiTabDialog({
      initialTab: "providers",
      currentModel: "claude-3-7-sonnet",
      currentProvider: "anthropic",
      onSelectModel: () => {},
      onSelectProvider: () => {},
      onClose: () => {},
    });
    const lines = dialog.render(80);
    expect(lines.join("\n")).toContain("Providers");
    expect(lines.join("\n")).toContain("Anthropic");
  });

  it("renders OAuthLoginDialog with sign-in link and manual fallback", () => {
    const login = new OAuthLoginDialog({
      providerName: "Anthropic",
      accountType: "Claude Pro/Max",
      onSuccess: () => {},
      onCancel: () => {},
    });
    const lines = login.render(80);
    expect(lines.join("\n")).toContain("Login to Anthropic (Claude Pro/Max)");
    expect(lines.join("\n")).toContain("Browser sign-in");
    expect(lines.join("\n")).toContain("Manual fallback");
  });

  it("renders ApiKeyPromptDialog with docs url and masked key input", () => {
    const dialog = new ApiKeyPromptDialog({
      providerId: "anthropic",
      providerName: "Anthropic",
      onSuccess: () => {},
      onCancel: () => {},
    });
    const lines = dialog.render(80);
    expect(lines.join("\n")).toContain("Set up Anthropic API Key");
    expect(lines.join("\n")).toContain("ANTHROPIC_API_KEY");
    expect(lines.join("\n")).toContain("console.anthropic.com");
  });
});



