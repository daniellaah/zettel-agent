import { describe, expect, it } from "vitest";

import {
  parseToolInput,
  rawFor,
  textOf,
  toolCallsOf,
  userText,
  type AssistantMessage,
} from "./messages";

const message: AssistantMessage = {
  role: "assistant",
  parts: [
    { type: "thinking", text: "t" },
    { type: "text", text: "a" },
    { type: "tool_call", id: "1", name: "search", input: {} },
    { type: "text", text: "b" },
  ],
  raw: { provider: "anthropic", model: "m1", content: ["raw"] },
};

describe("messages", () => {
  it("extracts text and tool calls", () => {
    expect(textOf(message)).toBe("ab");
    expect(toolCallsOf(message).map((c) => c.id)).toEqual(["1"]);
    expect(userText("hi")).toEqual({ role: "user", parts: [{ type: "text", text: "hi" }] });
  });

  it("returns raw content only for the same provider and model", () => {
    expect(rawFor(message, "anthropic", "m1")).toEqual(["raw"]);
    expect(rawFor(message, "anthropic", "m2")).toBeNull();
    expect(rawFor(message, "openai", "m1")).toBeNull();
  });

  it("parses tool arguments, keeping malformed JSON for validation", () => {
    expect(parseToolInput('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolInput("  ")).toEqual({});
    expect(parseToolInput("{bad")).toEqual({ __unparsed_arguments: "{bad" });
  });
});
