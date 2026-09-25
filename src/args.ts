import type { CliArgs } from "./types.js";

export const VERSION = "1.0.0";

export const HELP = `aic ${VERSION} — agentic coding CLI

Usage:
  aic [options] [prompt...]
  aic                         # interactive REPL
  aic "explain this repo"
  aic auto "write a debounce helper"
  aic --dry-run "fix the failing test"

Options:
  auto                 Write code immediately (also --auto)
  --dry-run            Plan only: no writes, no shell
  --cwd <dir>          Working directory (default: current)
  --model <name>       Model override (default: gpt-4o)
  --base-url <url>     OpenAI-compatible API base URL
  --max-steps <n>      Max agent tool rounds (default: 32)
  -h, --help           Show this help
  -v, --version        Show version

Config:
  ~/.config/aic/config.toml
  OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
`;

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    prompt: "",
    dryRun: false,
    auto: false,
    help: false,
    version: false,
    repl: false,
  };
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      i += 1;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      out.version = true;
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      i += 1;
      continue;
    }
    if (arg === "--auto") {
      out.auto = true;
      i += 1;
      continue;
    }
    const eq = splitEq(arg);
    if (eq) {
      assignFlag(out, eq.key, eq.value);
      i += 1;
      continue;
    }
    if (arg === "--cwd" || arg === "--model" || arg === "--base-url" || arg === "--max-steps") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`${arg} requires a value`);
      }
      assignFlag(out, arg, value);
      i += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positional.push(arg);
    i += 1;
  }
  out.prompt = positional.join(" ").trim();
  if (positional[0] === "auto") {
    out.auto = true;
    out.prompt = positional.slice(1).join(" ").trim();
  }
  out.repl = !out.prompt && !out.help && !out.version;
  return out;
}

function splitEq(arg: string): { key: string; value: string } | null {
  if (!arg.startsWith("--") || !arg.includes("=")) return null;
  const idx = arg.indexOf("=");
  return { key: arg.slice(0, idx), value: arg.slice(idx + 1) };
}

function assignFlag(out: CliArgs, key: string, value: string): void {
  if (key === "--cwd") {
    out.cwd = value;
    return;
  }
  if (key === "--model") {
    out.model = value;
    return;
  }
  if (key === "--base-url") {
    out.baseUrl = value;
    return;
  }
  if (key === "--max-steps") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Error("--max-steps must be a positive integer");
    out.maxSteps = n;
    return;
  }
  throw new Error(`Unknown flag: ${key}`);
}
