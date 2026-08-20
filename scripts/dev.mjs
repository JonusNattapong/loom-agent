import { watch } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const childArgs = ["--import", "tsx/esm", "packages/cli/src/index.ts", "repl"];
const watchRoots = [resolve(root, "packages"), resolve(root, "scripts")];
const sourcePattern = /\.(?:ts|tsx|json)$/i;

let child;
let restartTimer;
let restarting = false;
let shuttingDown = false;

function stopProcess(processToStop) {
  if (!processToStop || processToStop.exitCode !== null) return;

  if (process.platform === "win32") {
    // Windows has no POSIX signal semantics; terminate the whole child tree.
    spawn("taskkill", ["/PID", String(processToStop.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    processToStop.kill("SIGTERM");
  }
}

function startProcess() {
  child = spawn(process.execPath, childArgs, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  child.once("error", (error) => {
    console.error("[dev] failed to start Loom:", error);
    process.exitCode = 1;
  });

  child.once("exit", (code) => {
    if (shuttingDown) return;
    if (restarting) {
      restarting = false;
      startProcess();
      return;
    }
    process.exitCode = code ?? 1;
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!child || child.exitCode !== null) return;
    restarting = true;
    stopProcess(child);
  }, 120);
}

const watchers = watchRoots.map((directory) =>
  watch(directory, { recursive: true }, (_event, filename) => {
    if (filename && sourcePattern.test(String(filename))) scheduleRestart();
  }),
);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  for (const watcher of watchers) watcher.close();
  stopProcess(child);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
startProcess();
