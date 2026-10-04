import { expect, it } from "vitest";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { runAgentCase } from "./agent-runner";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { smokeAgent } from "./smoke";
import {
  answerUnits,
  indexedInput,
  indexedJudgmentSchema,
  materializeJudgment,
  judgeIndexed,
  replayIndexedInput,
  type IndexedJudgment,
} from "./indexed-scoring";

it("preserves all contiguous answer units and every occurrence, including uncited extras", () => {
  const answer = "# Header\n\nFact [E1]. More [E1].\n\nUncited extra.";
  const units = answerUnits(answer);
  expect(units.map((u) => u.quote)).toEqual([
    "# Header",
    "Fact [E1]. More [E1].",
    "Uncited extra.",
  ]);
  expect(units[1]!.citations).toEqual(["E1"]);
  expect(answerUnits("")).toEqual([]);
});
it("materializes only prebound exact quotes and rejects skipped, foreign and invented evidence selectors", async () => {
  const item = loadEvaluationData().answers.items[0]!;
  const run = await runAgentCase({
    item,
    corpus: loadFixtureCorpus(),
    provider: smokeAgent(item),
    trial: 1,
    mode: "scripted",
  });
  run.turns.at(-1)!.result.answer = "Fact [E1].\n\nOther assertion.";
  const input = indexedInput(item, run);
  const q = input.quotes.find((e) => e.evidenceId === "E1")!;
  expect(q).toBeDefined();
  const selection: IndexedJudgment = {
    schema: 1,
    keyPoints: item.keyPoints.map((p) => ({
      id: p.id,
      status: "missing",
      units: [],
      reason: "Unit test",
    })),
    forbidden: item.forbidden.map((_, index) => ({
      index,
      present: false,
      units: [],
      reason: "Unit test",
    })),
    units: [
      {
        index: 0,
        kind: "note",
        verdict: "supported",
        citations: [{ id: "E1", verdict: "supporting", reason: "Unit test" }],
        support: [q.index],
        reason: "Unit test",
      },
      {
        index: 1,
        kind: "note",
        verdict: "unsupported",
        citations: [],
        support: [],
        reason: "Uncited",
      },
    ],
    abstention: { status: "not-needed", reason: "Unit test" },
  };
  const judgment = materializeJudgment(selection, input);
  expect(judgment.claims[0]!.answerQuote).toBe("Fact [E1].");
  expect(judgment.claims[0]!.support[0]!.quote).toBe(q.quote);
  expect(() =>
    materializeJudgment({ ...selection, units: selection.units.slice(0, 1) }, input),
  ).toThrow("Every answer unit");
  const skipped = structuredClone(selection);
  skipped.units[0]!.kind = "nonfactual";
  expect(() => materializeJudgment(skipped, input)).toThrow("cannot be skipped");
  const fake = structuredClone(selection);
  fake.units[0]!.support = [999999];
  expect(() => materializeJudgment(fake, input)).toThrow("Unknown evidence quote");
  const invalidPoint = structuredClone(selection);
  invalidPoint.keyPoints[0]!.status = "covered";
  expect(() => materializeJudgment(invalidPoint, input)).toThrow("Invalid answer unit selection");
  expect(indexedJudgmentSchema.safeParse({ ...selection, surprise: true }).success).toBe(false);
  const provider = new ScriptedProvider([[text(JSON.stringify(selection))]]);
  const result = await judgeIndexed(item, run, provider);
  expect(result.judgment).toEqual(judgment);
  expect(result.attempts).toHaveLength(1);
  expect(provider.requests[0]!.allowTools).toBe(false);
  const broken = new ScriptedProvider([
    [text(JSON.stringify(skipped))],
    [text(JSON.stringify(selection))],
  ]);
  expect((await judgeIndexed(item, run, broken)).attempts).toHaveLength(2);
  await expect(judgeIndexed(item, run, provider, undefined, { maxRepairs: 3 })).rejects.toThrow(
    "repair count",
  );
  const wrongTarget = structuredClone(run);
  wrongTarget.turns[0]!.question = "different";
  expect(() => indexedInput(item, wrongTarget)).toThrow("Target question");
});

it("includes final search-excerpt bodies and metadata even when wrapper tags touch them", async () => {
  const item = loadEvaluationData().answers.items[0]!;
  const run = await runAgentCase({
    item,
    corpus: loadFixtureCorpus(),
    provider: smokeAgent(item),
    trial: 1,
    mode: "scripted",
  });
  const call = run.turns[0]!.calls[0]!;
  const exposure = { ...call.exposures[0]! };
  delete exposure.text;
  call.exposures = [exposure];
  call.outcome!.content = `[${exposure.id}] matched: final
<note path="${exposure.path}">
Metadata: {"source":"Published book"}

# Record

Final excerpt body without a trailing blank line.
</note>`;
  run.turns[0]!.calls = [call];
  const input = indexedInput(item, run);
  expect(
    input.quotes.some((q) => q.quote === "Final excerpt body without a trailing blank line."),
  ).toBe(true);
  expect(input.quotes.some((q) => q.quote === 'Metadata: {"source":"Published book"}')).toBe(true);
  expect(input.quotes.every((q) => !q.quote.includes("</note>"))).toBe(true);
  const legacy = { ...input.request, selectableDeliveredQuotes: input.quotes.slice(0, 1) };
  expect(replayIndexedInput(item, run, legacy).quotes).toEqual(legacy.selectableDeliveredQuotes);
  expect(() => replayIndexedInput(item, run, { ...legacy, answerability: "no-answer" })).toThrow(
    "changed",
  );
  expect(() =>
    replayIndexedInput(item, run, {
      ...legacy,
      selectableDeliveredQuotes: [{ ...input.quotes[0]!, quote: "Never delivered" }],
    }),
  ).toThrow("unbound");
  expect(() =>
    replayIndexedInput(item, run, {
      ...legacy,
      selectableDeliveredQuotes: [{ ...input.quotes[0]!, index: 5 }],
    }),
  ).toThrow("unbound");
  expect(() =>
    replayIndexedInput(item, run, {
      ...legacy,
      selectableDeliveredQuotes: [{ ...input.quotes[0]!, scope: "title" }],
    }),
  ).toThrow("unbound");
});
