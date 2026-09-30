import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { textOf, type AssistantMessage, type ChatMessage } from "./messages";
import { runTurn, type Budget } from "./loop";
import { ScriptedProvider, call, text, type Step } from "../testing/scripted-provider";

function makeContext() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("Z/Permanent/间隔重复.md", "# 间隔重复\n\n间隔重复比集中练习记得更久。");
  corpus.upsert(
    "Z/Permanent/Retrieval practice.md",
    "# Retrieval practice\n\nTesting beats rereading.",
  );
  return { corpus, ledger: new EvidenceLedger() };
}

async function run(steps: (Step | Error)[], budget?: Budget, history: ChatMessage[] = []) {
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
function expectValidTranscript(messages: ChatMessage[]) {
  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    const ids = message.parts.flatMap((p) => (p.type === "tool_call" ? [p.id] : []));
    if (ids.length === 0) return;
    const next = messages[index + 1];
    const answered =
      next?.role === "user"
        ? next.parts.flatMap((p) => (p.type === "tool_result" ? [p.callId] : []))
        : [];
    expect(answered).toEqual(ids);
  });
}

const contentOf = (message: ChatMessage) =>
  message.role === "assistant"
    ? textOf(message)
    : message.parts.map((p) => (p.type === "text" ? p.text : p.content)).join("\n");

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
    const reply: AssistantMessage = { role: "assistant", parts: [text("reply")] };
    const history: ChatMessage[] = [{ role: "user", parts: [text("earlier")] }, reply];
    const { provider } = await run([[text("ok")]], undefined, history);
    expect(provider.requests[0]!.messages.map(contentOf)).toEqual([
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
    expect(contentOf(lastUser)).toContain("research budget for this turn is used up");
  });

  it("runs at most eight tool calls from one response", async () => {
    const calls = Array.from({ length: 10 }, (_, i) => call("search", { query: `q${i}` }));
    const { result, toolSummaries } = await run([calls, [text("done")]]);
    expect(toolSummaries.filter((s) => s.endsWith("skipped"))).toHaveLength(2);
    const results = result.messages[2]!;
    const skippedNote = results.role === "user" ? results.parts.at(-1) : undefined;
    expect(skippedNote).toMatchObject({ type: "tool_result", isError: true });
    expectValidTranscript(result.messages);
  });

  it("nudges the model after repeated rounds without new evidence", async () => {
    const { provider } = await run([
      [call("search", { query: "间隔重复" })],
      [call("search", { query: "间隔重复" })],
      [call("search", { query: "间隔重复" })],
      [text("done")],
    ]);
    const nudges = provider.requests.map((r) =>
      contentOf(r.messages.at(-1)!).includes("only evidence you already had"),
    );
    expect(nudges).toEqual([false, false, false, true]);
  });

  it("answers tool calls it will not run, keeping the transcript valid", async () => {
    const { result } = await run([
      { parts: [call("search", { query: "间隔" })], finish: "max_tokens" },
    ]);
    expect(result.stop).toBe("max_tokens");
    expectValidTranscript(result.messages);
  });

  it("never commits a response that arrives after the turn was stopped", async () => {
    // Some SDKs end an aborted stream quietly and return what they have.
    const controller = new AbortController();
    controller.abort();
    const result = await runTurn({
      provider: new ScriptedProvider([[text("partial")]]),
      context: makeContext(),
      history: [],
      userContent: "q",
      signal: controller.signal,
    });
    expect(result.stop).toBe("aborted");
    expect(result.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("replaces an empty response with a placeholder so the transcript stays valid", async () => {
    const { result } = await run([[]]);
    expect(result.stop).toBe("answered");
    expect(result.messages[1]).toEqual({
      role: "assistant",
      parts: [{ type: "text", text: "(no response)" }],
    });
  });

  it("reports provider errors without committing a partial response", async () => {
    const { result } = await run([new Error("network down")]);
    expect(result.stop).toBe("error");
    expect(result.messages.map((m) => m.role)).toEqual(["user"]);
  });
});
