import type { ChatMessage, ChatRequest, ChatResponse, LlmClient, ToolCall } from "./types.js";

export class OpenAiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        tools: req.tools,
        tool_choice: req.tool_choice ?? "auto",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`API ${res.status} ${res.statusText}: ${text.slice(0, 800)}`);
    }
    let json: ChatCompletionJson;
    try {
      json = JSON.parse(text) as ChatCompletionJson;
    } catch {
      throw new Error(`API returned non-JSON: ${text.slice(0, 400)}`);
    }
    const choice = json.choices?.[0]?.message;
    if (!choice) throw new Error("API returned no choices");
    return {
      content: choice.content ?? null,
      tool_calls: (choice.tool_calls ?? []).map(normalizeToolCall),
    };
  }
}

type ChatCompletionJson = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

function normalizeToolCall(raw: {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}): ToolCall {
  return {
    id: raw.id ?? `call_${Math.random().toString(36).slice(2)}`,
    type: "function",
    function: {
      name: raw.function?.name ?? "",
      arguments: raw.function?.arguments ?? "{}",
    },
  };
}

export function assistantMessage(res: ChatResponse): ChatMessage {
  return {
    role: "assistant",
    content: res.content,
    tool_calls: res.tool_calls.length ? res.tool_calls : undefined,
  };
}
