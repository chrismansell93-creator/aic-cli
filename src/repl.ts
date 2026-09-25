import readline from "node:readline";
import { runAgent } from "./agent.js";
import { dim, accent } from "./color.js";
import type { ChatMessage, LlmClient } from "./types.js";
import type { ToolHost } from "./tools.js";

export async function runRepl(opts: {
  client: LlmClient;
  host: ToolHost;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  onEvent: Parameters<typeof runAgent>[0]["onEvent"];
}): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let history: ChatMessage[] = [{ role: "system", content: opts.systemPrompt }];

  process.stderr.write(dim("aic repl — /help, /exit, /clear\n"));

  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question(accent("aic> "), resolve));

  try {
    for (;;) {
      const line = (await ask()).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/clear") {
        history = [{ role: "system", content: opts.systemPrompt }];
        process.stderr.write(dim("context cleared\n"));
        continue;
      }
      if (line === "/help") {
        process.stderr.write("  type a task  |  /clear  |  /exit\n");
        continue;
      }
      const result = await runAgent({
        ...opts,
        prompt: line,
        history,
      });
      history = result.history;
      if (result.text) process.stdout.write(`${result.text}\n`);
    }
  } finally {
    rl.close();
  }
}
