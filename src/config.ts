import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, CliArgs } from "./types.js";
import { parseToml } from "./toml.js";
import { resolveCwd } from "./paths.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_STEPS = 32;

export type ConfigIo = {
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  cwd?: string;
  readFile?: (filePath: string) => string | null;
};

export function configPath(homedir = os.homedir()): string {
  return path.join(homedir, ".config", "aic", "config.toml");
}

export function resolveConfig(args: CliArgs, io: ConfigIo = {}): AppConfig {
  const env = io.env ?? process.env;
  const homedir = io.homedir ?? os.homedir();
  const readFile =
    io.readFile ??
    ((filePath: string) => {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    });

  const fileCfg = loadToml(readFile(configPath(homedir)));

  const apiKey =
    str(env.OPENAI_API_KEY) ||
    str(env.AIC_API_KEY) ||
    str(fileCfg.api_key) ||
    "";

  const baseUrl =
    args.baseUrl ||
    str(env.OPENAI_BASE_URL) ||
    str(env.AIC_BASE_URL) ||
    str(fileCfg.base_url) ||
    DEFAULT_BASE_URL;

  const model =
    args.model ||
    str(env.OPENAI_MODEL) ||
    str(env.AIC_MODEL) ||
    str(fileCfg.model) ||
    DEFAULT_MODEL;

  const maxSteps =
    args.maxSteps ??
    num(fileCfg.max_steps) ??
    DEFAULT_MAX_STEPS;

  return {
    apiKey,
    baseUrl: trimSlash(baseUrl),
    model,
    cwd: resolveCwd(args.cwd, io.cwd ?? process.cwd()),
    dryRun: args.dryRun,
    maxSteps,
  };
}

function loadToml(source: string | null): Record<string, string | number | boolean> {
  if (!source) return {};
  return parseToml(source);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 1) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
