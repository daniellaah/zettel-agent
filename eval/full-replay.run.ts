import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { fullPlan } from "./full-plan";
import { robustnessTask, type RobustCase } from "./robustness";
import { runAgentCase, deliveredEvidence } from "./agent-runner";
import { runBaselineCase } from "./baselines";
import { StrictReplayProvider, type ModelExchange } from "./model-recording";
import { judgeIndexed } from "./indexed-scoring";
import { JudgeOutputError } from "./answer-scoring";
import type { GradedRun } from "./agent-report";
import { sha256, validateSnapshot, readSnapshot } from "./validate";

it("strictly replays the completed evaluation without any live provider", async () => {
  const artifacts = path.join(import.meta.dirname, "artifacts");
  const dir = path.resolve(process.env.EVAL_FULL_REPLAY_DIR ?? "");
  if (!dir.startsWith(`${artifacts}/`)) throw new Error("Replay source outside artifacts");
  const sourceReport = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as {
    binding: {
      parent: {
        original: {
          implementation: Record<string, string>;
          answersSha256: string;
          retrievalSha256: string;
          freezeSha256: string;
          robustnessSha256: string;
        };
      };
    };
  };
  const binding = sourceReport.binding.parent.original;
  for (const [file, hash] of Object.entries({
    ...binding.implementation,
    "eval/suites/expanded/answers.json": binding.answersSha256,
    "eval/suites/expanded/retrieval.json": binding.retrievalSha256,
    "eval/suites/expanded/freeze.json": binding.freezeSha256,
    "eval/robustness/cases.json": binding.robustnessSha256,
  }))
    expect(sha256(readFileSync(path.join(import.meta.dirname, "..", file), "utf8")), file).toBe(
      hash,
    );
  const read = (file: string) => {
    if (!path.resolve(file).startsWith(`${artifacts}/`)) throw new Error("Foreign recording");
    return readFileSync(file, "utf8");
  };
  const checked = (ref: { path: string; sha256: string }) => {
    expect(sha256(read(ref.path))).toBe(ref.sha256);
    return ref.path;
  };
  type Saved = { record: GradedRun; inherited?: { path: string; sha256: string } };
  type Recording = {
    agent: ModelExchange[];
    judge: ModelExchange[];
    inheritedAgent?: { path: string; sha256: string } | null;
  };
  const recordingFor = (resultFile: string): Recording => {
    let file = resultFile;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(file)) throw new Error("Cyclic result inheritance");
      visited.add(file);
      const saved = JSON.parse(read(file)) as Saved;
      const cassette = file.replace(/-result\.json$/, "-recording.json");
      if (existsSync(cassette)) return JSON.parse(read(cassette)) as Recording;
      if (!saved.inherited) throw new Error("Missing recording");
      file = checked(saved.inherited);
    }
  };
  const agentExchanges = (recording: Recording): ModelExchange[] => {
    let cassette = recording;
    const visited = new Set<string>();
    while (cassette.inheritedAgent) {
      const file = checked(cassette.inheritedAgent);
      if (visited.has(file)) throw new Error("Cyclic recording inheritance");
      visited.add(file);
      cassette = JSON.parse(read(file)) as Recording;
    }
    return cassette.agent;
  };
  const data = loadEvaluationData("expanded");
  const corpus = loadFixtureCorpus();
  const robust = (
    JSON.parse(readFileSync(path.join(import.meta.dirname, "robustness/cases.json"), "utf8")) as {
      cases: RobustCase[];
    }
  ).cases;
  const plan = fullPlan(data.answers.items, robust);
  const cases: {
    name: string;
    agent: string;
    judge: string;
    solverExchanges: number;
    judgeExchanges: number;
  }[] = [];
  for (const job of plan) {
    const file = path.join(dir, `${job.name}-result.json`);
    const saved = JSON.parse(read(file)) as Saved;
    const recording = recordingFor(file);
    const exchanges = agentExchanges(recording);
    const provider = new StrictReplayProvider(
      saved.record.run.provider,
      saved.record.run.model,
      exchanges,
    );
    const taskCorpus = job.robust ? robustnessTask(job.robust).corpus : corpus;
    const options = {
      item: job.item,
      corpus: taskCorpus,
      provider,
      trial: job.trial,
      mode: "replay" as const,
    };
    const run =
      job.variant === "agent"
        ? await runAgentCase({ ...options, budget: saved.record.run.budget })
        : await runBaselineCase({ ...options, variant: job.variant });
    expect(provider.remaining, job.name).toBe(0);
    expect(
      run.turns.map((t) => [t.question, t.result.answer, t.result.stop]),
      job.name,
    ).toEqual(saved.record.run.turns.map((t) => [t.question, t.result.answer, t.result.stop]));
    expect(run.evidence, job.name).toEqual(saved.record.run.evidence);
    expect(deliveredEvidence(run), job.name).toEqual(deliveredEvidence(saved.record.run));
    expect(run.transcript, job.name).toEqual(saved.record.run.transcript);
    const partial = saved.record.run.turns.some((t) => t.result.stop === "error");
    // A preflight-rejected dispatch has no recorded response. Preserve it as failed, not replay success.
    if (!partial)
      expect(
        run.turns.map((t) => t.result),
        job.name,
      ).toEqual(saved.record.run.turns.map((t) => t.result));
    const judge = new StrictReplayProvider("deepseek", "deepseek-chat", recording.judge);
    if (!recording.judge.length) throw new Error(`Missing indexed judge cassette: ${job.name}`);
    const first = recording.judge[0]!.request.messages[0]!.parts[0]!;
    if (first.type !== "text") throw new Error("Judge request not text");
    let invalid = false;
    try {
      const graded = await judgeIndexed(job.item, saved.record.run, judge, undefined, {
        maxRepairs: recording.judge.length - 1,
        replayRequest: JSON.parse(first.text),
      });
      expect(graded.judgment, job.name).toEqual(saved.record.judgment);
    } catch (error) {
      if (!(error instanceof JudgeOutputError) || saved.record.judgment !== null) throw error;
      invalid = true;
    }
    expect(judge.remaining, job.name).toBe(0);
    cases.push({
      name: job.name,
      agent: partial ? "recorded prefix; original failed dispatch retained" : "exact replay",
      judge: invalid ? "original invalid judgment reproduced" : "exact replay",
      solverExchanges: exchanges.length,
      judgeExchanges: recording.judge.length,
    });
  }
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  writeFileSync(
    path.join(dir, "strict-replay.json"),
    `${JSON.stringify({ schema: 1, apiCalls: 0, sourceReportSha256: sha256(read(path.join(dir, "report.json"))), fullSolverReplays: cases.filter((c) => c.agent === "exact replay").length, failedDispatchPrefixes: cases.filter((c) => c.agent !== "exact replay").length, originalValidJudgeReplays: cases.filter((c) => c.judge === "exact replay").length, originalInvalidJudgeReplays: cases.filter((c) => c.judge !== "exact replay").length, cases }, null, 2)}\n`,
  );
  expect(cases).toHaveLength(86);
  console.log(`Strict replay: ${cases.length} cases; zero API calls`);
}, 120_000);
