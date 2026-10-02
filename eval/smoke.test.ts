import { expect, it } from "vitest";
import { runAgentCase } from "./agent-runner";
import { validateJudgment, scoreAnswer } from "./answer-scoring";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { smokeAgent, smokeJudgment } from "./smoke";

it("exercises all pilot rubrics without presenting scripted responses as model quality", async () => {
  const corpus = loadFixtureCorpus();
  for (const item of loadEvaluationData().answers.items) {
    const provider = smokeAgent(item);
    const run = await runAgentCase({ item, corpus, provider, trial: 1, mode: "scripted" });
    expect(run.turns).toHaveLength(item.history.length + 1);
    expect(validateJudgment(smokeJudgment(item), item, run)).toEqual([]);
    expect(scoreAnswer(smokeJudgment(item)).keyPointCoverage).toBe(0);
    expect(provider.requests.map((request) => request.system)).not.toContain(
      item.keyPoints[0]!.text,
    );
  }
});
