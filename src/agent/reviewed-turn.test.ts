import { expect, it } from "vitest";
import { Corpus } from "../retrieval/corpus";
import { EvidenceLedger } from "./evidence";
import { runTurn } from "./loop";
import { ScriptedProvider, text, call, type Step } from "../testing/scripted-provider";
import type { ModelProvider } from "./provider";

function setup() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("a.md", "# 研究\n\n测试通常比重读更有效，但结果取决于测量条件。");
  return { corpus, ledger: new EvidenceLedger() };
}
function review(supported = true, actions: unknown[] = []) {
  return text(
    JSON.stringify({
      units: [
        {
          index: 0,
          basis: "notes",
          verdict: supported ? "supported" : "unsupported",
          reason: "必须完整体现来源中的测量条件，不能声称适用于一切情形。",
          support: supported
            ? [{ id: "E1", quote: "测试通常比重读更有效，但结果取决于测量条件。" }]
            : [],
          searches: [],
        },
      ],
      coverage: [
        {
          question: "效果与限制？",
          status: supported ? "answered" : "missing",
          units: [0],
          disclosed: supported,
        },
      ],
      actions,
    }),
  );
}
async function run(steps: (Step | Error)[], maxRequests = 10, maxToolCalls = 30) {
  const provider = new ScriptedProvider(steps);
  const deltas: string[] = [];
  const result = await runTurn({
    provider,
    context: setup(),
    history: [],
    userContent: "效果与限制？",
    reviewMode: "self-review",
    budget: { maxRequests, maxToolCalls, maxToolChars: 120_000 },
    events: { onText: (delta) => deltas.push(delta) },
  });
  return { result, provider, deltas };
}
it("buffers drafts, repairs incomplete claims, rechecks every unit and accounts for all requests", async () => {
  const { result, provider, deltas } = await run([
    [call("read", { target: "a.md" })],
    [text("测试适用于所有情形 [E1]。")],
    [review(false, [{ tool: "read", target: "a.md" }])],
    [text("测试通常有效，但取决于测量条件 [E1]。")],
    [review()],
  ]);
  expect(deltas).toEqual(["测试通常有效，但取决于测量条件 [E1]。"]);
  expect(result.usage).toMatchObject({
    requests: 5,
    toolCalls: 2,
    inputTokens: 100,
    outputTokens: 50,
  });
  expect(result.reliability).toMatchObject({
    status: "self-reviewed",
    reviewer: { provider: "scripted", model: "scripted" },
    repairs: [{ tool: "read", isError: false }],
  });
  expect(result.reliability?.attempts.map((a) => a.draft)).toEqual([
    "测试适用于所有情形 [E1]。",
    result.answer,
  ]);
  expect(provider.requests.slice(2).every((r) => !r.allowTools)).toBe(true);
  expect(
    result.messages.some(
      (m) =>
        m.role === "assistant" &&
        m.parts.some((p) => p.type === "text" && p.text.includes("所有情形")),
    ),
  ).toBe(true);
});
it("fails closed on omitted units or invalid JSON and cannot start a repair without its review budget", async () => {
  const { result, deltas } = await run([[text("未经支持的断言。")], [text("{}")]], 2);
  expect(result.stop).toBe("budget_exhausted");
  expect(result.usage.requests).toBe(2);
  expect(result.reliability?.attempts[0]?.error).toBeTruthy();
  expect(deltas).toEqual([result.answer]);
  expect(result.answer).not.toContain("未经支持的断言");
});
it("does not accept a revised draft when the second review fails", async () => {
  const { result } = await run([
    [call("read", { target: "a.md" })],
    [text("不完整 [E1]。")],
    [review(false)],
    [text("仍然不完整 [E1]。")],
    [review(false)],
  ]);
  expect(result.reliability?.status).toBe("failed");
  expect(result.reliability?.attempts).toHaveLength(2);
  expect(result.stop).toBe("error");
});
it("limits repair tools and closes locally initiated tool calls when interrupted", async () => {
  const { result } = await run(
    [
      [call("read", { target: "a.md" })],
      [text("不完整 [E1]。")],
      [review(false, [{ tool: "read", target: "a.md" }])],
      [text("有测量条件限制 [E1]。")],
      [review()],
    ],
    10,
    1,
  );
  expect(result.usage.toolCalls).toBe(1);
  expect(result.reliability?.repairs).toEqual([]);
  const controller = new AbortController();
  const scripted = new ScriptedProvider([[text("未经检查")], [review()]]);
  const provider: ModelProvider = {
    ...scripted,
    provider: "scripted",
    model: "scripted",
    describeError: () => "failed",
    send: async (...args) => {
      const response = await scripted.send(args[0], args[1]);
      if (scripted.requests.length === 2) controller.abort();
      return response;
    },
  };
  const aborted = await runTurn({
    provider,
    context: setup(),
    history: [],
    userContent: "问题",
    reviewMode: "self-review",
    signal: controller.signal,
  });
  expect(aborted.stop).toBe("aborted");
  expect(aborted.answer).toBe("");
  expect(aborted.usage.requests).toBe(2);
});
it("keeps structural checks free and reports undelivered citations", async () => {
  const provider = new ScriptedProvider([[text("Claim [E99]")]]);
  const result = await runTurn({ provider, context: setup(), history: [], userContent: "q" });
  expect(result.usage.requests).toBe(1);
  expect(result.reliability?.issues[0]?.code).toBe("undelivered-citation");
});

it("closes both the transcript and UI trace when a targeted repair search is cancelled", async () => {
  const context = setup();
  const controller = new AbortController();
  const outcomes: boolean[] = [];
  const provider = new ScriptedProvider([
    [call("read", { target: "a.md" })],
    [text("不完整 [E1]。")],
    [review(false, [{ tool: "search", query: "限制" }])],
  ]);
  const result = await runTurn({
    provider,
    context: {
      ...context,
      search: () => {
        controller.abort(new Error("cancel repair"));
        return Promise.reject(controller.signal.reason as Error);
      },
    },
    history: [],
    userContent: "效果与限制？",
    reviewMode: "self-review",
    signal: controller.signal,
    events: { onToolResult: (outcome) => outcomes.push(outcome.isError) },
  });
  expect(result.stop).toBe("aborted");
  expect(result.answer).toBe("");
  expect(outcomes).toEqual([false, true]);
  expect(result.reliability?.repairs).toMatchObject([{ tool: "search", isError: true }]);
  const repair = result.messages.findIndex(
    (m) =>
      m.role === "assistant" &&
      m.parts.some((p) => p.type === "tool_call" && p.id.startsWith("review_")),
  );
  expect(result.messages[repair + 1]?.parts[0]).toMatchObject({
    type: "tool_result",
    isError: true,
  });
});
