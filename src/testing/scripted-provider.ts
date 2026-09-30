import type {
  BetaContentBlock,
  BetaMessage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import type { ModelProvider, ModelRequest, StreamHandlers } from "../agent/provider";

/** Test double for ModelProvider: replays scripted responses, records requests. */

export type Step =
  BetaContentBlock[] | { content: BetaContentBlock[]; stop: BetaMessage["stop_reason"] };

/** Replays scripted responses and records every request it receives. */
export class ScriptedProvider implements ModelProvider {
  readonly model = "scripted";
  readonly requests: ModelRequest[] = [];

  constructor(private readonly steps: (Step | Error)[]) {}

  send(request: ModelRequest, handlers: StreamHandlers): Promise<BetaMessage> {
    this.requests.push({ ...request, messages: structuredClone(request.messages) });
    const step = this.steps.shift();
    if (!step) throw new Error("script exhausted");
    if (step instanceof Error) return Promise.reject(step);
    const { content, stop } = Array.isArray(step) ? { content: step, stop: stopFor(step) } : step;
    for (const block of content) if (block.type === "text") handlers.onText(block.text);
    return Promise.resolve({
      id: `msg_${this.requests.length}`,
      type: "message",
      role: "assistant",
      model: this.model,
      content,
      stop_reason: stop,
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 0,
      },
    } as unknown as BetaMessage);
  }
}

function stopFor(content: BetaContentBlock[]): BetaMessage["stop_reason"] {
  return content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn";
}

export const text = (value: string) =>
  ({ type: "text", text: value, citations: null }) as BetaContentBlock;
let callCounter = 0;
export const call = (name: string, input: unknown) =>
  ({ type: "tool_use", id: `toolu_${++callCounter}`, name, input }) as BetaContentBlock;
