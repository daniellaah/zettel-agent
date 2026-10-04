import { expect, it } from "vitest";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { runBaselineCase } from "./baselines";
import { deliveredEvidence } from "./agent-runner";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";

it("fixed retrieval uses the query rather than gold and reports only actual delivered evidence", async () => {
  const original = loadEvaluationData().answers.items[0]!;
  const item = { ...original, evidence: {}, keyPoints: [] };
  const provider = new ScriptedProvider([[text("Evidence [E1].")]]);
  const corpus = loadFixtureCorpus();
  const run = await runBaselineCase({
    item,
    corpus,
    provider,
    trial: 1,
    mode: "scripted",
    variant: "fixed-retrieval",
  });
  expect(provider.requests[0]!.allowTools).toBe(false);
  expect(provider.requests[0]!.tools).toEqual([]);
  expect(run.turns[0]!.calls.slice(1).map((c) => (c.input as { target: string }).target)).toEqual(
    corpus.search(item.question, { limit: 5 }).map((h) => h.path),
  );
  expect(deliveredEvidence(run)).toHaveLength(6);
  expect(run.evidence.length).toBeGreaterThan(0);
  expect(JSON.stringify(provider.requests)).not.toContain("correctnessReferenceOnly");
});
it("no-vault has no deliveries, detects fake citations and retains failed turns", async () => {
  const item = loadEvaluationData().answers.items[0]!;
  const provider = new ScriptedProvider([[text("Invented [E999].")]]);
  const run = await runBaselineCase({
    item,
    corpus: loadFixtureCorpus(),
    provider,
    trial: 1,
    mode: "scripted",
    variant: "no-vault",
  });
  expect(run.evidence).toEqual([]);
  expect(deliveredEvidence(run)).toEqual([]);
  expect(run.turns[0]!.result.citations.unknown).toEqual(["E999"]);
  const failed = await runBaselineCase({
    item,
    corpus: loadFixtureCorpus(),
    provider: new ScriptedProvider([]),
    trial: 2,
    mode: "scripted",
    variant: "no-vault",
  });
  expect(failed.turns[0]!.result.stop).toBe("error");
  expect(failed.turns[0]!.result.error).toBeTruthy();
});
