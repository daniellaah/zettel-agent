import type { AssistantMessage, TextPart, ToolCallPart } from "../agent/messages";
import type {
  FinishReason,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamHandlers,
} from "../agent/provider";

/** Test double for ModelProvider: replays scripted responses, records requests. */

type Part = AssistantMessage["parts"][number];
export type Step = Part[] | { parts: Part[]; finish: FinishReason };

export class ScriptedProvider implements ModelProvider {
  readonly provider = "scripted";
  readonly model = "scripted";
  readonly requests: ModelRequest[] = [];

  constructor(private readonly steps: (Step | Error)[]) {}

  send(request: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    this.requests.push({ ...request, messages: structuredClone(request.messages) });
    const step = this.steps.shift();
    if (!step) throw new Error("script exhausted");
    if (step instanceof Error) return Promise.reject(step);
    const { parts, finish } = Array.isArray(step) ? { parts: step, finish: finishFor(step) } : step;
    for (const part of parts) {
      if (part.type === "text") handlers.onText(part.text);
      if (part.type === "thinking") handlers.onThinking(part.text);
    }
    return Promise.resolve({
      message: { role: "assistant", parts },
      finish,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 80, cacheWriteTokens: 0 },
    });
  }

  describeError(error: unknown): string {
    return error instanceof Error ? error.message : "failed";
  }
}

function finishFor(parts: Part[]): FinishReason {
  return parts.some((part) => part.type === "tool_call") ? "tool_calls" : "end";
}

export const text = (value: string): TextPart => ({ type: "text", text: value });

let callCounter = 0;
export const call = (name: string, input: unknown): ToolCallPart => ({
  type: "tool_call",
  id: `call_${++callCounter}`,
  name,
  input,
});
