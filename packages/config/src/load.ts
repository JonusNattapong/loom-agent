import {promises as fs} from "node:fs";
import {existsSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";
import yaml from "js-yaml";
import type {LoomConfig} from "./schema.js";
import {CURRENT_SCHEMA_VERSION} from "./schema.js";

export interface LoadOptions {
  cwd?: string;
  /** Overrides applied last (highest precedence), e.g. from CLI flags. */
  overrides?: Partial<LoomConfig>;
  /** Explicit config path; skips discovery when provided. */
  configPath?: string;
}

export interface LoadResult {
  config: LoomConfig;
  /** Where the effective config was read from, for diagnostics. */
  source: string;
}

const DEFAULT_CONFIG: LoomConfig = {schemaVersion: CURRENT_SCHEMA_VERSION};

/**
 * Load Loom configuration with documented precedence:
 *   CLI overrides > environment > project config > user config > defaults
 */
export async function loadConfig(options: LoadOptions = {}): Promise<LoadResult> {
  const cwd = options.cwd ?? process.cwd();
  const projectConfig = await readConfigFile(options.configPath ?? join(cwd, ".loom", "config.json"));
  const userConfig = await readConfigFile(join(homedir(), ".loom", "config.json"));
  const envConfig = configFromEnv();

  const merged: LoomConfig = mergeConfigs([
    DEFAULT_CONFIG,
    userConfig,
    projectConfig,
    envConfig,
    options.overrides ?? {},
  ]);
  const source = options.configPath ?? (projectConfig ? join(cwd, ".loom", "config.json") : userConfig ? join(homedir(), ".loom", "config.json") : "<defaults>");
  return {config: merged, source};
}

async function readConfigFile(path: string): Promise<LoomConfig | undefined> {
  try {
    const text = await fs.readFile(path, "utf8");
    const parsed = path.endsWith(".yaml") || path.endsWith(".yml") ? yaml.load(text) : JSON.parse(text);
    return (parsed ?? undefined) as LoomConfig | undefined;
  } catch {
    return undefined;
  }
}

function configFromEnv(): Partial<LoomConfig> {
  const out: Partial<LoomConfig> = {};
  if (process.env.LOOM_PROVIDER) {
    out.provider = {...(out.provider ?? {}), id: process.env.LOOM_PROVIDER};
  }
  if (process.env.LOOM_MODEL) {
    out.provider = {...(out.provider ?? {}), model: process.env.LOOM_MODEL};
  }
  if (process.env.LOOM_CONTROL_PORT) {
    out.controlPlane = {...(out.controlPlane ?? {}), port: Number(process.env.LOOM_CONTROL_PORT)};
  }
  return out;
}

function mergeConfigs(layers: Array<Partial<LoomConfig> | undefined>): LoomConfig {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      if (key === "schemaVersion") {
        result.schemaVersion = value;
      } else if (Array.isArray(value)) {
        const existing = Array.isArray(result[key]) ? (result[key] as unknown[]) : [];
        result[key] = [...existing, ...value];
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = {...(typeof result[key] === "object" && result[key] ? result[key] : {}), ...value};
      } else {
        result[key] = value;
      }
    }
  }
  // ensure schemaVersion present
  if (typeof result.schemaVersion !== "number") result.schemaVersion = CURRENT_SCHEMA_VERSION;
  return result as unknown as LoomConfig;
}

/** Write a minimal starter config. Used by `loom init`. */
export async function writeStarterConfig(cwd: string, name: string): Promise<string> {
  const path = join(cwd, ".loom", "config.json");
  await fs.mkdir(join(cwd, ".loom"), {recursive: true});
  const starter: LoomConfig = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    runtime: {maxConcurrentJobs: 4},
    policy: {tools: {shell: "ask"}},
  };
  await fs.writeFile(path, JSON.stringify(starter, null, 2) + "\n", "utf8");
  return path;
}

export {CURRENT_SCHEMA_VERSION};
