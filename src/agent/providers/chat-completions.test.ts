import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../messages";
import type { ModelRequest } from "../provider";
import { ChatCompletionsProvider, toChatMessages } from "./chat-completions";

const TOOLS = [{ name: "search", description: "Search", inputSchema: { type: "object" } }];

/** A fetch that records request bodies and answers with the given SSE chunks. */
function sseFetch(chunks: object[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    const payload =
      chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    return Promise.resolve(
      new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, bodies };
}

const chunk = (delta: object, finish: string | null = null) => ({
  id: "c1",
  object: "chat.completion.chunk",
  created: 0,
  model: "deepseek-flash",
  choices: [{ index: 0, delta, finish_reason: finish }],
});

const USAGE = {
  id: "c1",
  object: "chat.completion.chunk",
  created: 0,
  model: "deepseek-flash",
  choices: [],
  usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 800 },
};

function deepseek(fetch: typeof globalThis.fetch) {
  return new ChatCompletionsProvider("sk-test", "deepseek-flash", {
    provider: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    deepseekThinking: true,
    fetch,
  });
}

const request = (messages: ChatMessage[], allowTools = true): ModelRequest => ({
  system: "SYS",
  messages,
  tools: TOOLS,
  allowTools,
});

describe("ChatCompletionsProvider (DeepSeek)", () => {
  it("streams reasoning, text and split tool-call arguments into one message", async () => {
    const { fetch } = sseFetch([
      chunk({ role: "assistant", reasoning_content: "先想" }),
      chunk({ reasoning_content: "一下" }),
      chunk({ content: "搜索中" }),
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_a",
            type: "function",
            function: { name: "search", arguments: '{"que' },
          },
        ],
      }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'ry":"双塔"}' } }] }),
      chunk({
        tool_calls: [
          { index: 1, id: "call_b", type: "function", function: { name: "list", arguments: "{}" } },
        ],
      }),
      chunk({}, "tool_calls"),
      USAGE,
    ]);
    const thinking: string[] = [];
    const text: string[] = [];
    const response = await deepseek(fetch).send(
      request([{ role: "user", parts: [{ type: "text", text: "q" }] }]),
      {
        onText: (d) => text.push(d),
        onThinking: (d) => thinking.push(d),
      },
    );

    expect(thinking.join("")).toBe("先想一下");
    expect(text.join("")).toBe("搜索中");
    expect(response.finish).toBe("tool_calls");
    expect(response.message.parts).toEqual([
      { type: "thinking", text: "先想一下" },
      { type: "text", text: "搜索中" },
      { type: "tool_call", id: "call_a", name: "search", input: { query: "双塔" } },
      { type: "tool_call", id: "call_b", name: "list", input: {} },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 200,
      outputTokens: 50,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
    });
    expect(response.message.raw?.content).toMatchObject({ reasoning_content: "先想一下" });
  });

  it("enables thinking with tools, and disables it to force an answer on the final request", async () => {
    const { fetch, bodies } = sseFetch([chunk({ content: "ok" }, "stop"), USAGE]);
    const provider = deepseek(fetch);
    const messages: ChatMessage[] = [{ role: "user", parts: [{ type: "text", text: "q" }] }];
    await provider.send(request(messages, true), { onText: () => {}, onThinking: () => {} });
    await provider.send(request(messages, false), { onText: () => {}, onThinking: () => {} });

    expect(bodies[0]).toMatchObject({ thinking: { type: "enabled" }, stream: true });
    expect(bodies[0]).not.toHaveProperty("tool_choice");
    expect(bodies[1]).toMatchObject({ thinking: { type: "disabled" }, tool_choice: "none" });
  });

  it("maps finish reasons and reports capacity errors", async () => {
    const long = sseFetch([chunk({ content: "cut" }, "length"), USAGE]);
    const response = await deepseek(long.fetch).send(request([]), {
      onText: () => {},
      onThinking: () => {},
    });
    expect(response.finish).toBe("max_tokens");

    const busy = sseFetch([chunk({}, "insufficient_system_resource")]);
    await expect(
      deepseek(busy.fetch).send(request([]), { onText: () => {}, onThinking: () => {} }),
    ).rejects.toThrow(/out of capacity/);
  });
});

describe("toChatMessages", () => {
  const raw = {
    role: "assistant",
    content: null,
    reasoning_content: "推理",
    tool_calls: [{ id: "call_a", type: "function", function: { name: "search", arguments: "{}" } }],
  };
  const history: ChatMessage[] = [
    { role: "user", parts: [{ type: "text", text: "q" }] },
    {
      role: "assistant",
      parts: [{ type: "tool_call", id: "call_a", name: "search", input: {} }],
      raw: { provider: "deepseek", model: "deepseek-flash", content: raw },
    },
    {
      role: "user",
      parts: [
        { type: "tool_result", callId: "call_a", content: "result", isError: false },
        { type: "text", text: "budget note" },
      ],
    },
  ];

  it("replays DeepSeek's own messages verbatim, with tool results before user text", () => {
    expect(toChatMessages("SYS", history, "deepseek", "deepseek-flash")).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "q" },
      raw,
      { role: "tool", tool_call_id: "call_a", content: "result" },
      { role: "user", content: "budget note" },
    ]);
  });

  it("converts another model's turns, with an empty reasoning_content", () => {
    const converted = toChatMessages("SYS", history, "deepseek", "deepseek-v4-pro")[2];
    expect(converted).toEqual({
      role: "assistant",
      content: null,
      reasoning_content: "",
      tool_calls: [
        { id: "call_a", type: "function", function: { name: "search", arguments: "{}" } },
      ],
    });
  });
});
