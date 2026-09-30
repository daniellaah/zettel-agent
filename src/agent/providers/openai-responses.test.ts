import type { Response } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../messages";
import { fromResponse, toResponsesInput } from "./openai-responses";

const output = [
  {
    type: "reasoning",
    id: "rs_1",
    summary: [{ type: "summary_text", text: "plan" }],
    encrypted_content: "enc",
  },
  {
    type: "message",
    id: "msg_1",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "Searching.", annotations: [] }],
  },
  {
    type: "function_call",
    id: "fc_1",
    call_id: "call_1",
    name: "search",
    arguments: '{"query":"q"}',
  },
];

function response(overrides: Partial<Response> = {}): Response {
  return {
    output,
    incomplete_details: null,
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 700 },
      output_tokens: 40,
      output_tokens_details: { reasoning_tokens: 20 },
      total_tokens: 1040,
    },
    ...overrides,
  } as unknown as Response;
}

describe("fromResponse", () => {
  it("maps reasoning summaries, text and function calls", () => {
    const result = fromResponse(response(), "gpt-6.1-sol");
    expect(result.message.parts).toEqual([
      { type: "thinking", text: "plan" },
      { type: "text", text: "Searching." },
      { type: "tool_call", id: "call_1", name: "search", input: { query: "q" } },
    ]);
    expect(result.finish).toBe("tool_calls");
    expect(result.usage).toEqual({
      inputTokens: 300,
      outputTokens: 40,
      cacheReadTokens: 700,
      cacheWriteTokens: 0,
    });
    expect(result.message.raw).toEqual({
      provider: "openai",
      model: "gpt-6.1-sol",
      content: output,
    });
  });

  it("keeps malformed arguments for validation to report", () => {
    const bad = response({
      output: [
        { type: "function_call", id: "fc", call_id: "c", name: "search", arguments: '{"query":' },
      ],
    } as unknown as Partial<Response>);
    expect(fromResponse(bad, "m").message.parts[0]).toMatchObject({
      input: { __unparsed_arguments: '{"query":' },
    });
  });

  it("reports truncation and refusals", () => {
    const truncated = response({
      incomplete_details: { reason: "max_output_tokens" },
    });
    expect(fromResponse(truncated, "m").finish).toBe("max_tokens");
    const refusal = response({
      output: [
        {
          type: "message",
          id: "m",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "No." }],
        },
      ],
    } as unknown as Partial<Response>);
    expect(fromResponse(refusal, "m")).toMatchObject({
      finish: "refusal",
      message: { parts: [{ type: "text", text: "No." }] },
    });
  });
});

describe("toResponsesInput", () => {
  const history: ChatMessage[] = [
    { role: "user", parts: [{ type: "text", text: "q" }] },
    {
      role: "assistant",
      parts: [
        { type: "text", text: "Searching." },
        { type: "tool_call", id: "call_1", name: "search", input: { query: "q" } },
      ],
      raw: { provider: "openai", model: "gpt-6.1-sol", content: output },
    },
    {
      role: "user",
      parts: [
        { type: "tool_result", callId: "call_1", content: "hits", isError: false },
        { type: "text", text: "note" },
      ],
    },
  ];

  it("replays output items (encrypted reasoning included) and answers calls before text", () => {
    expect(toResponsesInput(history, "gpt-6.1-sol")).toEqual([
      { role: "user", content: "q" },
      ...output,
      { type: "function_call_output", call_id: "call_1", output: "hits" },
      { role: "user", content: "note" },
    ]);
  });

  it("converts another model's turns without reasoning items", () => {
    expect(toResponsesInput(history, "gpt-6-astra").slice(1, 3)).toEqual([
      { role: "assistant", content: "Searching." },
      { type: "function_call", call_id: "call_1", name: "search", arguments: '{"query":"q"}' },
    ]);
  });
});
