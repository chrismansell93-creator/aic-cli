import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs, HELP, VERSION } from "../src/args.ts";
import { parseToml } from "../src/toml.ts";
import { resolveConfig } from "../src/config.ts";
import { resolveWithinCwd } from "../src/paths.ts";
import { ToolHost, matchGlob } from "../src/tools.ts";
import { runAgent } from "../src/agent.ts";
import { systemPrompt } from "../src/prompt.ts";
import type { ChatRequest, ChatResponse, LlmClient } from "../src/types.ts";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aic-"));
}

test("1. parseArgs joins remaining tokens into a prompt", () => {
  const a = parseArgs(["explain", "this", "repo"]);
  assert.equal(a.prompt, "explain this repo");
  assert.equal(a.repl, false);
});

test("2. parseArgs sets dryRun from --dry-run", () => {
  const a = parseArgs(["--dry-run", "fix the failing test"]);
  assert.equal(a.dryRun, true);
  assert.equal(a.prompt, "fix the failing test");
});

test("3. parseArgs reads --cwd, --model, and --base-url", () => {
  const a = parseArgs([
    "--cwd",
    "/tmp/project",
    "--model=gpt-4o-mini",
    "--base-url",
    "http://localhost:11434/v1",
    "hello",
  ]);
  assert.equal(a.cwd, "/tmp/project");
  assert.equal(a.model, "gpt-4o-mini");
  assert.equal(a.baseUrl, "http://localhost:11434/v1");
  assert.equal(a.prompt, "hello");
});

test("4. parseArgs with no prompt is REPL mode", () => {
  const a = parseArgs([]);
  assert.equal(a.repl, true);
  assert.equal(a.prompt, "");
});

test("5. parseArgs --help and --version", () => {
  const h = parseArgs(["--help"]);
  assert.equal(h.help, true);
  assert.equal(h.repl, false);
  const v = parseArgs(["-v"]);
  assert.equal(v.version, true);
  assert.match(HELP, /aic/);
  assert.equal(VERSION, "1.0.0");
});

test("6. parseToml handles strings, numbers, booleans, and comments", () => {
  const t = parseToml(`
# comment
model = "gpt-4o"
max_steps = 32
dry = true
base_url = 'http://x/v1' # trailing
`);
  assert.equal(t.model, "gpt-4o");
  assert.equal(t.max_steps, 32);
  assert.equal(t.dry, true);
  assert.equal(t.base_url, "http://x/v1");
});

test("7. resolveConfig loads ~/.config/aic/config.toml", () => {
  const home = tmp();
  const cwd = tmp();
  const cfgFile = path.join(home, ".config", "aic", "config.toml");
  fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
  fs.writeFileSync(cfgFile, `model = "from-toml"\napi_key = "sk-toml"\nbase_url = "https://toml.example/v1"\n`);
  const cfg = resolveConfig(parseArgs([]), {
    env: {},
    homedir: home,
    cwd,
  });
  assert.equal(cfg.model, "from-toml");
  assert.equal(cfg.apiKey, "sk-toml");
  assert.equal(cfg.baseUrl, "https://toml.example/v1");
  assert.equal(cfg.cwd, cwd);
});

test("8. env vars override toml", () => {
  const home = tmp();
  const cwd = tmp();
  fs.mkdirSync(path.join(home, ".config", "aic"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".config", "aic", "config.toml"),
    `model = "toml"\napi_key = "sk-toml"\nbase_url = "https://toml/v1"\n`,
  );
  const cfg = resolveConfig(parseArgs([]), {
    env: {
      OPENAI_API_KEY: "sk-env",
      OPENAI_MODEL: "env-model",
      OPENAI_BASE_URL: "https://env/v1/",
    },
    homedir: home,
    cwd,
  });
  assert.equal(cfg.apiKey, "sk-env");
  assert.equal(cfg.model, "env-model");
  assert.equal(cfg.baseUrl, "https://env/v1");
});

test("9. CLI flags override env", () => {
  const cwd = tmp();
  const project = tmp();
  const cfg = resolveConfig(parseArgs(["--model", "flag-model", "--base-url", "https://flag/v1", "--cwd", project]), {
    env: { OPENAI_API_KEY: "sk-env", OPENAI_MODEL: "env-model", OPENAI_BASE_URL: "https://env/v1" },
    homedir: tmp(),
    cwd,
  });
  assert.equal(cfg.model, "flag-model");
  assert.equal(cfg.baseUrl, "https://flag/v1");
  assert.equal(cfg.cwd, project);
  assert.equal(cfg.apiKey, "sk-env");
});

test("10. resolveWithinCwd allows relative paths inside cwd", () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, "src"));
  const abs = resolveWithinCwd(cwd, "src/app.ts");
  assert.equal(abs, path.join(cwd, "src", "app.ts"));
});

test("11. resolveWithinCwd rejects path traversal", () => {
  const cwd = tmp();
  assert.throws(() => resolveWithinCwd(cwd, "../secret"), /escapes workspace/);
  assert.throws(() => resolveWithinCwd(cwd, ".."), /escapes workspace/);
});

test("12. write_file and read_file roundtrip", () => {
  const cwd = tmp();
  const host = new ToolHost(cwd, false);
  const wrote = host.writeFile("hello.txt", "hello aic");
  assert.match(wrote, /Wrote hello.txt/);
  const read = host.readFile("hello.txt");
  assert.match(read, /hello aic/);
  assert.match(read, /1\|hello aic/);
});

test("13. edit_file, glob, and grep", () => {
  const cwd = tmp();
  const host = new ToolHost(cwd, false);
  host.writeFile("src/sum.ts", "export const add = (a: number, b: number) => a - b;\n");
  host.writeFile("src/sum.test.ts", "import { add } from './sum.ts';\n");
  const edited = host.editFile("src/sum.ts", "a - b", "a + b");
  assert.equal(edited, "Edited src/sum.ts");
  assert.match(fs.readFileSync(path.join(cwd, "src/sum.ts"), "utf8"), /a \+ b/);
  const globbed = host.glob("**/*.ts");
  assert.match(globbed, /src\/sum\.ts/);
  assert.match(globbed, /src\/sum\.test\.ts/);
  assert.equal(matchGlob("src/sum.ts", "**/*.ts"), true);
  const grepped = host.grep("export const add", ".", "*.ts");
  assert.match(grepped, /src\/sum\.ts:1:/);
});

test("14. dry-run skips writes and bash; agent loop uses tools", async () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, "README.md"), "# demo\n");
  const host = new ToolHost(cwd, true);
  const write = host.writeFile("oops.txt", "nope");
  assert.match(write, /DRY RUN/);
  assert.equal(fs.existsSync(path.join(cwd, "oops.txt")), false);
  const bash = await host.bash("rm -rf /");
  assert.match(bash, /DRY RUN: would run/);

  const calls: string[] = [];
  const client: LlmClient = {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const last = req.messages[req.messages.length - 1];
      if (last?.role === "user") {
        calls.push("tool");
        return {
          content: null,
          tool_calls: [
            {
              id: "1",
              type: "function",
              function: { name: "read_file", arguments: JSON.stringify({ path: "README.md" }) },
            },
          ],
        };
      }
      calls.push("final");
      return { content: "This repo is a demo.", tool_calls: [] };
    },
  };
  const result = await runAgent({
    client,
    host,
    prompt: "explain this repo",
    model: "test",
    systemPrompt: "test",
    maxSteps: 8,
  });
  assert.deepEqual(calls, ["tool", "final"]);
  assert.equal(result.text, "This repo is a demo.");
});

test("15. parseArgs auto subcommand and --auto flag", () => {
  const sub = parseArgs(["auto", "write", "a", "debounce"]);
  assert.equal(sub.auto, true);
  assert.equal(sub.prompt, "write a debounce");
  assert.equal(sub.repl, false);
  const flag = parseArgs(["--auto", "implement the parser"]);
  assert.equal(flag.auto, true);
  assert.equal(flag.prompt, "implement the parser");
  const bare = parseArgs(["auto"]);
  assert.equal(bare.auto, true);
  assert.equal(bare.repl, true);
});

test("16. auto system prompt asks to implement immediately", () => {
  const text = systemPrompt("/tmp/project", false, true);
  assert.match(text, /AUTO CODE is on/);
  assert.match(text, /implement immediately/);
});
