import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { runTurn } from "./loop";
import type { ModelRequest } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIResponsesProvider } from "./providers/openai-responses";
import {
  cassetteFileName,
  recordingFetch,
  replayFetch,
  type Exchange,
  type FetchLike,
} from "./recording";

const sse = (events: [string, object][]) =>
  events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const exchange = (body: string, contentType = "text/event-stream"): Exchange => ({
  url: "https://api.example/v1",
  requestBody: null,
  status: 200,
  contentType,
  body,
});

/** Records every request an adapter sends while replaying canned responses. */
function replayAndCapture(bodies: string[]) {
  const sent: Exchange[] = [];
  const fetch: FetchLike = recordingFetch(
    replayFetch(
      bodies.map((body) => exchange(body)),
      { eventDelayMs: 0 },
    ),
    (ex) => sent.push(ex),
  );
  return { fetch, sent };
}

const request = (text: string, allowTools = true): ModelRequest => ({
  system: "SYS",
  messages: [{ role: "user", parts: [{ type: "text", text }] }],
  tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }],
  allowTools,
});

// A Claude streamed response: thinking with a signature, text, then a tool call whose
// input arrives in pieces.
const anthropicToolCall = (id: string, query: string) =>
  sse([
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Plan" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig123" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Searching " } }],
    ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "notes." } }],
    ["content_block_stop", { type: "content_block_stop", index: 1 }],
    ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id, name: "search", input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"query":' } }],
    ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: JSON.stringify(query) + "}" } }],
    ["content_block_stop", { type: "content_block_stop", index: 2 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 42 } }],
    ["message_stop", { type: "message_stop" }],
  ]); // prettier-ignore

const anthropicAnswer = (text: string) =>
  sse([
    ["message_start", { type: "message_start", message: { id: "msg_2", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } }],
    ["message_stop", { type: "message_stop" }],
  ]); // prettier-ignore

describe("recordingFetch", () => {
  it("records the request body and full response without disturbing the stream", async () => {
    const recorded: Exchange[] = [];
    const inner: FetchLike = () =>
      Promise.resolve(
        new Response("data: 1\n\ndata: 2\n\n", {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const fetch = recordingFetch(inner, (ex) => recorded.push(ex));
    const response = await fetch("https://api.example/v1/x", {
      method: "POST",
      body: '{"q":1}',
      headers: { authorization: "Bearer secret" },
    });
    expect(await response.text()).toBe("data: 1\n\ndata: 2\n\n");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recorded).toEqual([
      {
        url: "https://api.example/v1/x",
        requestBody: { q: 1 },
        status: 200,
        contentType: "text/event-stream",
        body: "data: 1\n\ndata: 2\n\n",
      },
    ]);
    expect(JSON.stringify(recorded)).not.toContain("secret");
  });
});

describe("replayFetch", () => {
  it("serves exchanges in order and fails clearly when they run out", async () => {
    const fetch = replayFetch([
      exchange("a", "application/json"),
      exchange("b", "application/json"),
    ]);
    expect(await (await fetch("u")).text()).toBe("a");
    expect(await (await fetch("u")).text()).toBe("b");
    await expect(fetch("u")).rejects.toThrow(/no more responses/);
  });

  it("streams SSE event by event and honours abort", async () => {
    const controller = new AbortController();
    const fetch = replayFetch([exchange("data: 1\n\ndata: 2\n\ndata: 3\n\n")], { eventDelayMs: 5 });
    const response = await fetch("u", { signal: controller.signal });
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toBe("data: 1\n\n");
    controller.abort();
    await expect(reader.read()).rejects.toThrow(/aborted/);
  });

  it("replays long token-by-token streams within the time cap", async () => {
    const body = Array.from({ length: 2000 }, (_, i) => `data: ${i}\n\n`).join("");
    const fetch = replayFetch([exchange(body)], { eventDelayMs: 15, maxResponseMs: 300 });
    const started = Date.now();
    const text = await (await fetch("u")).text();
    expect(text).toBe(body);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(replayFetch([exchange("x")])("u", { signal: controller.signal })).rejects.toThrow(
      /aborted/,
    );
  });
});

describe("cassetteFileName", () => {
  it("is stable, readable and separates providers and models", () => {
    const a = cassetteFileName(
      "deepseek",
      "deepseek-flash",
      "  Swing 算法怎么处理 兴趣很广的用户？ ",
    );
    expect(a).toBe(
      cassetteFileName("deepseek", "deepseek-flash", "Swing 算法怎么处理 兴趣很广的用户？"),
    );
    expect(a).toMatch(/^deepseek\/Swing-算法怎么处理-兴趣很广的用户-[0-9a-f]+\.json$/);
    expect(
      cassetteFileName("deepseek", "deepseek-v4-pro", "Swing 算法怎么处理 兴趣很广的用户？"),
    ).not.toBe(a);
  });
});

describe("AnthropicProvider streaming (replayed)", () => {
  it("parses a streamed tool call and keeps the thinking signature for replay", async () => {
    const { fetch, sent } = replayAndCapture([anthropicToolCall("toolu_1", "双塔")]);
    const provider = new AnthropicProvider("sk-test", "claude-opus-5-5", { fetch });
    const text: string[] = [];
    const thinking: string[] = [];
    const response = await provider.send(request("q"), {
      onText: (d) => text.push(d),
      onThinking: (d) => thinking.push(d),
    });

    expect(text.join("")).toBe("Searching notes.");
    expect(thinking.join("")).toBe("Plan");
    expect(response.finish).toBe("tool_calls");
    expect(response.message.parts).toEqual([
      { type: "thinking", text: "Plan" },
      { type: "text", text: "Searching notes." },
      { type: "tool_call", id: "toolu_1", name: "search", input: { query: "双塔" } },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 100,
      outputTokens: 42,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
    });
    expect(JSON.stringify(response.message.raw?.content)).toContain("sig123");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent[0]!.requestBody).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "medium" },
      fallbacks: "default",
      tool_choice: { type: "auto" },
    });
  });
});

describe("OpenAIResponsesProvider streaming (replayed)", () => {
  it("parses reasoning summaries, text and a function call from the event stream", async () => {
    const output = [
      { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "plan" }], encrypted_content: "enc" },
      { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Searching.", annotations: [] }] },
      { type: "function_call", id: "fc_1", call_id: "call_1", name: "search", arguments: '{"query":"q"}', status: "completed" },
    ]; // prettier-ignore
    const base = { id: "resp_1", object: "response", created_at: 0, model: "gpt-6.1-sol", status: "in_progress", output: [], incomplete_details: null, error: null, tools: [], parallel_tool_calls: true, tool_choice: "auto", instructions: null, metadata: {}, temperature: null, top_p: null }; // prettier-ignore
    const completed = {
      ...base,
      status: "completed",
      output,
      usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 600 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 1030 },
    }; // prettier-ignore
    const body = sse([
      ["response.created", { type: "response.created", sequence_number: 0, response: base }],
      ["response.output_item.added", { type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { ...output[0], summary: [] } }],
      ["response.reasoning_summary_part.added", { type: "response.reasoning_summary_part.added", sequence_number: 2, item_id: "rs_1", output_index: 0, summary_index: 0, part: { type: "summary_text", text: "" } }],
      ["response.reasoning_summary_text.delta", { type: "response.reasoning_summary_text.delta", sequence_number: 2, item_id: "rs_1", output_index: 0, summary_index: 0, delta: "plan" }],
      ["response.output_item.done", { type: "response.output_item.done", sequence_number: 3, output_index: 0, item: output[0] }],
      ["response.output_item.added", { type: "response.output_item.added", sequence_number: 4, output_index: 1, item: { ...output[1], status: "in_progress", content: [] } }],
      ["response.content_part.added", { type: "response.content_part.added", sequence_number: 5, item_id: "msg_1", output_index: 1, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }],
      ["response.output_text.delta", { type: "response.output_text.delta", sequence_number: 6, item_id: "msg_1", output_index: 1, content_index: 0, delta: "Searching.", logprobs: [] }],
      ["response.output_item.done", { type: "response.output_item.done", sequence_number: 7, output_index: 1, item: output[1] }],
      ["response.output_item.added", { type: "response.output_item.added", sequence_number: 8, output_index: 2, item: { ...output[2], arguments: "", status: "in_progress" } }],
      ["response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", sequence_number: 9, item_id: "fc_1", output_index: 2, delta: '{"query":"q"}' }],
      ["response.output_item.done", { type: "response.output_item.done", sequence_number: 10, output_index: 2, item: output[2] }],
      ["response.completed", { type: "response.completed", sequence_number: 11, response: completed }],
    ]); // prettier-ignore

    const { fetch, sent } = replayAndCapture([body, body]);
    const provider = new OpenAIResponsesProvider("sk-test", "gpt-6.1-sol", { fetch });
    const text: string[] = [];
    const thinking: string[] = [];
    const response = await provider.send(request("q", false), {
      onText: (d) => text.push(d),
      onThinking: (d) => thinking.push(d),
    });

    expect(text.join("")).toBe("Searching.");
    expect(thinking.join("")).toBe("plan");
    expect(response.message.parts).toEqual([
      { type: "thinking", text: "plan" },
      { type: "text", text: "Searching." },
      { type: "tool_call", id: "call_1", name: "search", input: { query: "q" } },
    ]);
    expect(response.usage).toMatchObject({
      inputTokens: 400,
      cacheReadTokens: 600,
      outputTokens: 30,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent[0]!.requestBody).toMatchObject({
      model: "gpt-6.1-sol",
      instructions: "SYS",
      store: false,
      include: ["reasoning.encrypted_content"],
      tool_choice: "none",
      reasoning: { effort: "medium", summary: "auto" },
    });

    // The SDK adds `parsed_arguments` to function calls; the API rejects it as input.
    await provider.send(
      {
        ...request("q"),
        messages: [
          ...request("q").messages,
          response.message,
          {
            role: "user",
            parts: [{ type: "tool_result", callId: "call_1", content: "r", isError: false }],
          },
        ],
      },
      { onText: () => {}, onThinking: () => {} },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const input = (sent[1]!.requestBody as { input: Record<string, unknown>[] }).input;
    expect(input.find((item) => item.type === "function_call")).toEqual({
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "search",
      arguments: '{"query":"q"}',
      status: "completed",
    });
  });
});

describe("a full agent turn replayed offline", () => {
  it("runs the real adapter, loop and tools with no network", async () => {
    const corpus = new Corpus({ stageForPath: () => "permanent" });
    corpus.upsert("Z/Permanent/双塔召回.md", "# 双塔召回\n\n双塔模型把召回变成最近邻搜索。");
    const { fetch } = replayAndCapture([
      anthropicToolCall("toolu_9", "双塔"),
      anthropicAnswer("双塔把召回变成最近邻搜索 [E1]。"),
    ]);
    const result = await runTurn({
      provider: new AnthropicProvider("sk-test", "claude-opus-5-5", { fetch }),
      context: { corpus, ledger: new EvidenceLedger() },
      history: [],
      userContent: "双塔是什么？",
    });
    expect(result.stop).toBe("answered");
    expect(result.answer).toBe("双塔把召回变成最近邻搜索 [E1]。");
    expect(result.citations).toEqual({ valid: ["E1"], unknown: [] });
    expect(result.usage.requests).toBe(2);
  });
});

it("strict replay binds complete wire history/evidence and refuses mismatches offline", async () => {
  const ex = {
    ...exchange("{}", "application/json"),
    requestBody: { model: "model", messages: [{ content: "Evidence original" }] },
  };
  const fetch = replayFetch([ex], { strict: true, eventDelayMs: 0 });
  await expect(
    fetch(ex.url, {
      body: JSON.stringify({ messages: [{ content: "Evidence changed" }], model: "model" }),
    }),
  ).rejects.toThrow("Replay refused");
  const matching = replayFetch([ex], { strict: true, eventDelayMs: 0 });
  expect(
    await (
      await matching(ex.url, {
        body: JSON.stringify({ messages: [{ content: "Evidence original" }], model: "model" }),
      })
    ).text(),
  ).toBe("{}");
});
