export type CliArgs = {
  prompt: string;
  dryRun: boolean;
  auto: boolean;
  cwd?: string;
  model?: string;
  baseUrl?: string;
  maxSteps?: number;
  help: boolean;
  version: boolean;
  repl: boolean;
};

export type AppConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  cwd: string;
  dryRun: boolean;
  maxSteps: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools: unknown[];
  tool_choice?: "auto";
};

export type ChatResponse = {
  content: string | null;
  tool_calls: ToolCall[];
};

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export type AgentEvent =
  | { type: "tool"; name: string; args: Record<string, unknown>; result: string; dryRun: boolean }
  | { type: "text"; text: string }
  | { type: "step"; step: number };
