import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { agenticPhase, agenticPlan, agenticReference, type AgenticCase } from "./agentic-plan";
import { loadEvaluationData } from "./fixture-vault";
import { robustnessTask, robustnessInterfaceChecks } from "./robustness";
import { executeTool } from "../src/agent/tools";
import { EvidenceLedger } from "../src/agent/evidence";
import { answerItemSchema } from "./schema";
const cases = (
  JSON.parse(
    readFileSync(path.join(import.meta.dirname, "robustness/agentic-rag-v1.json"), "utf8"),
  ) as { cases: AgenticCase[] }
).cases;
it("predeclares paired variants and repeats and rejects missing/duplicate cases", () => {
  const items = loadEvaluationData("expanded").answers.items;
  const plan = agenticPlan(items, cases, 2);
  expect(new Set(plan.map((j) => j.name)).size).toBe(plan.length);
  expect(plan.filter((j) => j.id === "ar01")).toHaveLength(6);
  expect(plan.slice(-3).every((j) => j.group === "previously-used-test")).toBe(true);
  expect(() => agenticPlan([], cases)).toThrow("Missing");
  expect(() => agenticPlan(items, [...cases, cases[0]!])).toThrow("Duplicate");
  expect(() => agenticPlan(items, cases, 0)).toThrow("repeats");
});
it("keeps new long, Chinese, conflict and injection fixtures in memory, separate from the frozen vault", () => {
  for (const test of cases) {
    const { corpus, item } = robustnessTask(test);
    expect(() => answerItemSchema.parse(item)).not.toThrow();
    expect(Object.values(robustnessInterfaceChecks(corpus))).toEqual(Array(7).fill(true));
  }
  const { corpus, item } = robustnessTask(cases[0]!);
  expect(item.lang).toBe("zh");
  const context = { corpus, ledger: new EvidenceLedger() };
  const prefix = executeTool("read", { target: corpus.paths()[0]!, max_chars: 4000 }, context);
  expect(prefix.contract?.truncated).toBe(true);
  expect(prefix.content).not.toContain("模型身份都匹配时复用");
  const targeted = executeTool(
    "read",
    { target: `${corpus.paths()[0]}#复用规则`, max_chars: 4000 },
    context,
  );
  expect(targeted.content).toContain("输入身份与模型身份都匹配");
  expect(targeted.contract?.exposures[0]?.wholeSection).toBe(true);
});

it("keeps preflight free even when an earlier environment selected live evaluation", () => {
  expect(agenticPhase({ EVAL_MODE: "live", EVAL_ALLOW_API: "1" })).toBe("prepare");
  expect(() => agenticPhase({ AGENTIC_PHASE: "live" })).toThrow("EVAL_ALLOW_API");
  expect(agenticPhase({ AGENTIC_PHASE: "live", EVAL_ALLOW_API: "1" })).toBe("live");
  expect(() => agenticPhase({ AGENTIC_PHASE: "maybe" })).toThrow("Invalid");
});

it("rereads edited synthetic sources on follow-up and preserves the historical hash", async () => {
  const { runAgentCase } = await import("./agent-runner");
  const { ScriptedProvider, call, text } = await import("../src/testing/scripted-provider");
  const test = cases.find((c) => c.id === "ar04")!;
  const { corpus, item } = robustnessTask(test);
  const initialHash = corpus.get(test.notes[0]!.path)!.contentHash;
  const run = await runAgentCase({
    item,
    corpus,
    trial: 1,
    mode: "scripted",
    provider: new ScriptedProvider([
      [call("read", { target: test.notes[0]!.path })],
      [text("Sixty seconds [E1].")],
      [call("read", { target: test.notes[0]!.path })],
      [text("Ten seconds now [E2].")],
    ]),
    beforeTurn: (current, index) => {
      if (index === 1)
        current.upsert(test.updateBeforeFinal![0]!.path, test.updateBeforeFinal![0]!.body);
    },
  });
  expect(run.turns[1]!.result.context?.staleEvidence).toEqual(["E1"]);
  expect(run.evidence.find((e) => e.id === "E1")?.contentHash).toBe(initialHash);
  expect(run.evidence.find((e) => e.id === "E2")?.contentHash).not.toBe(initialHash);
  expect(run.turns[1]!.result.reliability?.issues).toEqual([]);
});

it("updates final correctness references while keeping historical source snapshots unchanged", () => {
  const test = cases.find((c) => c.id === "ar04")!;
  const { item } = robustnessTask(test);
  const reference = agenticReference(item, test.updateBeforeFinal);
  expect(Object.values(reference.evidence)[0]!.excerpt).toContain(
    "current policy permits a lifetime of ten seconds",
  );
  expect(Object.values(item.evidence)[0]!.excerpt).toContain(
    "initial policy permits a lifetime of sixty seconds",
  );
  expect(agenticReference(item, undefined)).toBe(item);
});
