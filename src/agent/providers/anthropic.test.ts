import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../messages";
import { fromAnthropicMessage, toAnthropicMessages } from "./anthropic";

const rawContent = [
  { type: "thinking", thinking: "plan", signature: "sig" },
  { type: "text", text: "Searching." },
  { type: "tool_use", id: "toolu_1", name: "search", input: { query: "q" } },
];

const history: ChatMessage[] = [
  { role: "user", parts: [{ type: "text", text: "question" }] },
  {
    role: "assistant",
    parts: [
      { type: "thinking", text: "plan" },
      { type: "text", text: "Searching." },
      { type: "tool_call", id: "toolu_1", name: "search", input: { query: "q" } },
    ],
    raw: { provider: "anthropic", model: "claude-opus-5-5", content: rawContent },
  },
  {
    role: "user",
    parts: [
      { type: "tool_result", callId: "toolu_1", content: "no matches", isError: true },
      { type: "text", text: "note" },
    ],
  },
];

describe("toAnthropicMessages", () => {
  it("replays the same model's content verbatim, signatures included", () => {
    const messages = toAnthropicMessages(history, "claude-opus-5-5");
    expect(messages[1]).toEqual({ role: "assistant", content: rawContent });
    expect(messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "no matches", is_error: true },
        { type: "text", text: "note" },
      ],
    });
  });

  it("drops another model's thinking but keeps text and tool calls", () => {
    expect(toAnthropicMessages(history, "claude-sonnet-5-5")[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Searching." },
        { type: "tool_use", id: "toolu_1", name: "search", input: { query: "q" } },
      ],
    });
  });

  it("never sends an empty assistant message", () => {
    const empty: ChatMessage[] = [{ role: "assistant", parts: [] }];
    expect(toAnthropicMessages(empty, "m")[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "(no response)" }],
    });
  });
});

describe("fromAnthropicMessage", () => {
  it("normalizes content, finish reason and usage", () => {
    const message = {
      content: rawContent,
      stop_reason: "tool_use",
      usage: {
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 60,
      },
    } as unknown as BetaMessage;
    const response = fromAnthropicMessage(message, "claude-opus-5-5");
    expect(response.finish).toBe("tool_calls");
    expect(response.message.parts.map((p) => p.type)).toEqual(["thinking", "text", "tool_call"]);
    expect(response.message.raw).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      content: rawContent,
    });
    expect(response.usage).toEqual({
      inputTokens: 12,
      outputTokens: 34,
      cacheReadTokens: 500,
      cacheWriteTokens: 60,
    });
  });

  it.each([
    ["end_turn", "end"],
    ["max_tokens", "max_tokens"],
    ["refusal", "refusal"],
    ["pause_turn", "pause"],
  ])("maps stop reason %s to %s", (stop, finish) => {
    const message = {
      content: [],
      stop_reason: stop,
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as BetaMessage;
    expect(fromAnthropicMessage(message, "m").finish).toBe(finish);
  });
});
