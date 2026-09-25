import { assistantMessage } from "./client.js";
import { TOOL_DEFINITIONS, ToolHost } from "./tools.js";
import type { AgentEvent, ChatMessage, LlmClient } from "./types.js";

export async function runAgent(opts: {
  client: LlmClient;
  host: ToolHost;
  prompt: string;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  history?: ChatMessage[];
  onEvent?: (event: AgentEvent) => void;
}): Promise<{ text: string; history: ChatMessage[] }> {
  const messages: ChatMessage[] = opts.history?.length
    ? [...opts.history, { role: "user", content: opts.prompt }]
    : [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.prompt },
      ];

  let lastText = "";
  for (let step = 1; step <= opts.maxSteps; step++) {
    opts.onEvent?.({ type: "step", step });
    const res = await opts.client.chat({
      model: opts.model,
      messages,
      tools: [...TOOL_DEFINITIONS],
      tool_choice: "auto",
    });

    if (res.tool_calls.length > 0) {
      messages.push(assistantMessage(res));
      for (const call of res.tool_calls) {
        const result = await opts.host.execute(call.function.name, call.function.arguments);
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          parsed = { raw: call.function.arguments };
        }
        opts.onEvent?.({
          type: "tool",
          name: call.function.name,
          args: parsed,
          result,
          dryRun: opts.host.dryRun,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result,
        });
      }
      continue;
    }

    lastText = (res.content ?? "").trim();
    if (lastText) opts.onEvent?.({ type: "text", text: lastText });
    messages.push({ role: "assistant", content: lastText || null });
    return { text: lastText, history: messages };
  }

  const stop = `Stopped after ${opts.maxSteps} steps.`;
  opts.onEvent?.({ type: "text", text: stop });
  return { text: stop, history: messages };
}
