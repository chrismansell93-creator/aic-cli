#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, HELP, VERSION } from "./args.js";
import { resolveConfig, configPath } from "./config.js";
import { OpenAiClient } from "./client.js";
import { ToolHost } from "./tools.js";
import { runAgent } from "./agent.js";
import { runRepl } from "./repl.js";
import { systemPrompt } from "./prompt.js";
import { accent, dim, err, warn } from "./color.js";
import type { AgentEvent } from "./types.js";

async function main(argv = process.argv.slice(2)): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${err(e instanceof Error ? e.message : String(e))}\n${HELP}`);
    return 1;
  }

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let cfg;
  try {
    cfg = resolveConfig(args);
  } catch (e) {
    process.stderr.write(`${err(e instanceof Error ? e.message : String(e))}\n`);
    return 1;
  }

  if (!cfg.apiKey) {
    process.stderr.write(
      `${err("Missing API key.")} Set OPENAI_API_KEY or add api_key to ${configPath()}\n`,
    );
    return 1;
  }

  const client = new OpenAiClient(cfg.apiKey, cfg.baseUrl);
  const host = new ToolHost(cfg.cwd, cfg.dryRun);
  const sys = systemPrompt(cfg.cwd, cfg.dryRun, args.auto);

  process.stderr.write(
    dim(
      `aic ${VERSION}  model=${cfg.model}  cwd=${cfg.cwd}${cfg.dryRun ? "  dry-run" : ""}${args.auto ? "  auto" : ""}\n`,
    ),
  );

  const onEvent = (event: AgentEvent) => {
    if (event.type === "tool") {
      const preview = summarizeArgs(event.name, event.args);
      const tag = event.dryRun ? warn("[dry-run] ") : "";
      process.stderr.write(`${tag}${accent("›")} ${event.name}${preview ? dim(` ${preview}`) : ""}\n`);
    }
  };

  try {
    if (args.repl) {
      await runRepl({
        client,
        host,
        model: cfg.model,
        systemPrompt: sys,
        maxSteps: cfg.maxSteps,
        onEvent,
      });
      return 0;
    }
    const result = await runAgent({
      client,
      host,
      prompt: args.prompt,
      model: cfg.model,
      systemPrompt: sys,
      maxSteps: cfg.maxSteps,
      onEvent,
    });
    if (result.text) process.stdout.write(`${result.text}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`${err(e instanceof Error ? e.message : String(e))}\n`);
    return 1;
  }
}

function summarizeArgs(name: string, args: Record<string, unknown>): string {
  if (name === "bash") return String(args.command ?? "");
  if (typeof args.path === "string") return args.path;
  if (typeof args.pattern === "string") return args.pattern;
  return "";
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().then((code) => process.exit(code));
}

export { main };
