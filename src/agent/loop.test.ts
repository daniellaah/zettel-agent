import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { runTurn, type Budget } from "./loop";
import type { ModelProvider, ModelRequest, StreamHandlers } from "./provider";

type Step = BetaContentBlock[] | { content: BetaContentBlock[]; stop: BetaMessage["stop_reason"] };

/** Replays scripted responses and records every request it receives. */
class ScriptedProvider implements ModelProvider {
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

const text = (value: string) =>
  ({ type: "text", text: value, citations: null }) as BetaContentBlock;
let callCounter = 0;
const call = (name: string, input: unknown) =>
  ({ type: "tool_use", id: `toolu_${++callCounter}`, name, input }) as BetaContentBlock;

function makeContext() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("Z/Permanent/间隔重复.md", "# 间隔重复\n\n间隔重复比集中练习记得更久。");
  corpus.upsert(
    "Z/Permanent/Retrieval practice.md",
    "# Retrieval practice\n\nTesting beats rereading.",
  );
  return { corpus, ledger: new EvidenceLedger() };
}

async function run(steps: (Step | Error)[], budget?: Budget, history: BetaMessageParam[] = []) {
  const provider = new ScriptedProvider(steps);
  const deltas: string[] = [];
  const toolSummaries: string[] = [];
  const result = await runTurn({
    provider,
    context: makeContext(),
    history,
    userContent: "间隔重复有什么用？",
    ...(budget && { budget }),
    events: {
      onText: (delta) => deltas.push(delta),
      onToolResult: (outcome) => toolSummaries.push(outcome.summary),
    },
  });
  return { result, provider, deltas, toolSummaries };
}

/** Every tool_use in the transcript must be answered by a tool_result. */
function expectValidTranscript(messages: BetaMessageParam[]) {
  messages.forEach((message, index) => {
    if (message.role !== "assistant" || typeof message.content === "string") return;
    const ids = message.content.flatMap((b) => (b.type === "tool_use" ? [b.id] : []));
    if (ids.length === 0) return;
    const next = messages[index + 1];
    const answered =
      next && typeof next.content !== "string"
        ? next.content.flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : []))
        : [];
    expect(answered).toEqual(ids);
  });
}

describe("runTurn", () => {
  it("returns a direct answer without tools", async () => {
    const { result, provider, deltas } = await run([[text("你好")]]);
    expect(result.stop).toBe("answered");
    expect(result.answer).toBe("你好");
    expect(deltas).toEqual(["你好"]);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(provider.requests[0]!.allowTools).toBe(true);
  });

  it("runs tools, then validates the answer's citations", async () => {
    const { result, toolSummaries } = await run([
      [call("search", { query: "间隔重复" })],
      [text("间隔重复让记忆更持久 [E1]，另见 [E9]。")],
    ]);
    expect(toolSummaries).toEqual(['search "间隔重复" → 1 note']);
    expect(result.citations).toEqual({ valid: ["E1"], unknown: ["E9"] });
    expect(result.usage).toMatchObject({ requests: 2, toolCalls: 1, cacheReadTokens: 160 });
    expectValidTranscript(result.messages);
  });

  it("sends history before the new turn", async () => {
    const history: BetaMessageParam[] = [
      { role: "user", content: "earlier" },
      { role: "assistant", content: "reply" },
    ];
    const { provider } = await run([[text("ok")]], undefined, history);
    expect(provider.requests[0]!.messages.map((m) => m.content)).toEqual([
      "earlier",
      "reply",
      "间隔重复有什么用？",
    ]);
  });

  it("disables tools on the reserved final request", async () => {
    const { result, provider } = await run(
      [[call("search", { query: "间隔重复" })], [text("基于已有证据回答 [E1]")]],
      { maxRequests: 2, maxToolCalls: 30, maxToolChars: 100_000 },
    );
    expect(provider.requests.map((r) => r.allowTools)).toEqual([true, false]);
    expect(result.stop).toBe("answered");
  });

  it("stops researching when the tool budget is used up", async () => {
    const { result, provider } = await run(
      [
        [call("search", { query: "间隔重复" }), call("search", { query: "retrieval" })],
        [text("预算用完，基于 [E1] 回答")],
      ],
      { maxRequests: 10, maxToolCalls: 2, maxToolChars: 100_000 },
    );
    expect(result.stop).toBe("budget_exhausted");
    expect(provider.requests[1]!.allowTools).toBe(false);
    const lastUser = provider.requests[1]!.messages.at(-1)!;
    expect(JSON.stringify(lastUser.content)).toContain("research budget for this turn is used up");
  });

  it("nudges the model after repeated rounds without new evidence", async () => {
    const { provider } = await run([
      [call("search", { query: "间隔重复" })],
      [call("search", { query: "间隔重复" })],
      [call("search", { query: "间隔重复" })],
      [text("done")],
    ]);
    const nudges = provider.requests.map((r) =>
      JSON.stringify(r.messages.at(-1)!.content).includes("only evidence you already had"),
    );
    expect(nudges).toEqual([false, false, false, true]);
  });

  it("answers tool calls it will not run, keeping the transcript valid", async () => {
    const { result } = await run([
      { content: [call("search", { query: "间隔" })], stop: "max_tokens" },
    ]);
    expect(result.stop).toBe("max_tokens");
    expectValidTranscript(result.messages);
  });

  it("reports provider errors without committing a partial response", async () => {
    const { result } = await run([new Error("network down")]);
    expect(result.stop).toBe("error");
    expect(result.messages.map((m) => m.role)).toEqual(["user"]);
  });
});
