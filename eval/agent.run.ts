import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createProvider } from "../src/agent/providers/index";
import type { ProviderId } from "../src/agent/providers/catalog";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { runAgentCase } from "./agent-runner";
import { judgeAnswer, scoreAnswer, type Judgment } from "./answer-scoring";
import { sumUsage, summarizeAgentRuns, type GradedRun } from "./agent-report";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { judgmentLabels } from "./calibration";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { RecordedProvider, StrictReplayProvider, type ModelExchange } from "./model-recording";
import { runConfig, selectItems } from "./run-config";
import { smokeAgent, smokeJudgment } from "./smoke";
import { readSnapshot, sha256, validateSets, validateSnapshot } from "./validate";

// Deliberately not *.eval.ts: npm run eval remains offline retrieval only.
it("runs the frozen answer tasks through the production loop", async () => {
  const config = runConfig(process.env);
  const { manifest, retrieval, answers, files } = loadEvaluationData();
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
  expect(validateSets(manifest, retrieval, answers, corpus)).toEqual([]);
  const root = path.resolve(import.meta.dirname, "..");
  expect(sha256(readFileSync(path.join(root, "fixtures/technical-note-audit.json"), "utf8"))).toBe(
    manifest.sourceAuditSha256,
  );
  const items = selectItems(answers.items, config.split, config.ids);
  const runtimeFiles = [
    "src/agent/loop.ts",
    "src/agent/tools.ts",
    "src/agent/tool-contract.ts",
    "src/agent/prompt.ts",
    "src/agent/evidence.ts",
    "src/agent/messages.ts",
    "src/agent/providers/index.ts",
    "src/agent/providers/errors.ts",
    "src/agent/providers/anthropic.ts",
    "src/agent/providers/openai-responses.ts",
    "src/agent/providers/chat-completions.ts",
    "src/retrieval/corpus.ts",
    "src/retrieval/markdown.ts",
    "src/retrieval/lexical-index.ts",
    "src/retrieval/tokenize.ts",
    "src/retrieval/graph.ts",
    "src/settings.ts",
    "eval/agent-runner.ts",
    "eval/answer-scoring.ts",
    "eval/budget-provider.ts",
    "eval/run-config.ts",
    "eval/agent-report.ts",
    "eval/model-recording.ts",
    "eval/calibration.ts",
    "eval/smoke.ts",
    "eval/agent.run.ts",
    "package-lock.json",
  ];
  const binding = {
    corpusId: manifest.corpusId,
    corpusHash: manifest.corpusHash,
    sourceAuditSha256: manifest.sourceAuditSha256,
    answersSha256: sha256(readFileSync(files.answers, "utf8")),
    implementation: Object.fromEntries(
      runtimeFiles.map((file) => [file, sha256(readFileSync(path.join(root, file), "utf8"))]),
    ),
  };
  const out = path.join(
    import.meta.dirname,
    "artifacts",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${config.mode}`,
  );
  mkdirSync(out, { recursive: true });
  const allowance: SpendingAllowance = {
    limitUsd: config.live?.maxUsd ?? 0,
    accountedUsd: 0,
    calls: 0,
    maxCalls: config.live?.maxCalls ?? 0,
  };
  const records: GradedRun[] = [];
  const failures: string[] = [];
  for (const item of items) {
    for (let trial = 1; trial <= config.repeats; trial++) {
      const name = `${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${trial}`;
      const recorded =
        config.mode === "replay"
          ? (JSON.parse(
              readFileSync(path.join(config.replayDir!, `${name}-recording.json`), "utf8"),
            ) as {
              binding: typeof binding;
              provider: string;
              model: string;
              judgeProvider: string;
              judgeModel: string;
              agent: ModelExchange[];
              judge: ModelExchange[];
            })
          : null;
      if (
        config.mode === "replay" &&
        (!recorded ||
          typeof recorded.provider !== "string" ||
          typeof recorded.model !== "string" ||
          typeof recorded.judgeProvider !== "string" ||
          typeof recorded.judgeModel !== "string" ||
          !Array.isArray(recorded.agent) ||
          !Array.isArray(recorded.judge))
      )
        throw new Error("Invalid replay recording; no fallback to scripted or live providers");
      if (recorded && JSON.stringify(recorded.binding) !== JSON.stringify(binding))
        throw new Error("Replay binding changed");
      const agent = new RecordedProvider(
        config.live
          ? new BudgetProvider(
              createProvider(
                config.live.agent.provider,
                apiKey(config.live.agent.provider),
                config.live.agent.model,
              ),
              config.live.agent.rates,
              allowance,
            )
          : recorded
            ? new StrictReplayProvider(recorded.provider, recorded.model, recorded.agent)
            : smokeAgent(item),
      );
      const run = await runAgentCase({
        item,
        corpus,
        provider: agent,
        trial,
        mode: config.mode === "smoke" ? "scripted" : config.mode,
        signal: AbortSignal.timeout(300_000),
      });
      writeJson(`${name}-run.json`, run);
      const judge = new RecordedProvider(
        config.live
          ? new BudgetProvider(
              createProvider(
                config.live.judge.provider,
                apiKey(config.live.judge.provider),
                config.live.judge.model,
              ),
              config.live.judge.rates,
              allowance,
            )
          : recorded
            ? new StrictReplayProvider(recorded.judgeProvider, recorded.judgeModel, recorded.judge)
            : new ScriptedProvider([[text(JSON.stringify(smokeJudgment(item)))]]),
      );
      let judgment: Judgment | null = null;
      let gradingError: string | null = null;
      const judgeStart = performance.now();
      try {
        const graded = await judgeAnswer(item, run, judge, AbortSignal.timeout(180_000));
        judgment = graded.judgment;
        writeJson(`${name}-judgment.json`, graded);
        const runSha256 = sha256(JSON.stringify(run));
        const judgmentSha256 = sha256(JSON.stringify(judgment));
        // A blank independent review sheet, not synthetic human approval.
        writeJson(`${name}-human-review.json`, {
          schema: 1,
          runSha256,
          judgmentSha256,
          reviewer: "owner",
          status: "pending",
          labels: Object.fromEntries(
            Object.keys(judgmentLabels(judgment)).map((key) => [key, null]),
          ),
          comments: "",
          omittedClaims: [],
        });
        writeJson(`${name}-human-packet.json`, {
          question: item.question,
          history: item.history,
          answerability: item.answerability,
          answer: run.turns.at(-1)!.result.answer,
          referenceForCorrectnessOnly: {
            keyPoints: item.keyPoints,
            forbidden: item.forbidden,
            evidence: item.evidence,
            graphChecks: item.graphChecks,
          },
          // The run file holds exact deliveries. Judge verdicts are intentionally omitted here.
          runFile: `${name}-run.json`,
          claimsToReview: judgment.claims.map((claim) => ({
            id: claim.id,
            answerQuote: claim.answerQuote,
            kind: claim.kind,
            citations: claim.citations.map((citation) => citation.id),
          })),
          instructions:
            "Review independently before opening the judge file. Verify claim extraction completeness; list missed factual answer substrings in omittedClaims. Grade support using actual tool outputs, never unseen reference excerpts.",
        });
      } catch (error) {
        gradingError = judge.describeError(error);
        failures.push(`${name}: ${gradingError}`);
      }
      // Invalid JSON or a rejected judgment can still have incurred billable tokens.
      const judgeUsage = sumUsage(judge.exchanges.map((exchange) => exchange.response.usage));
      const judgeElapsedMs = performance.now() - judgeStart;
      if (
        recorded &&
        (agent.exchanges.length !== recorded.agent.length ||
          judge.exchanges.length !== recorded.judge.length)
      )
        throw new Error("Replay did not consume all recorded requests");
      records.push({
        run,
        agentUsage: sumUsage(agent.exchanges.map((exchange) => exchange.response.usage)),
        targetQuestion: item.question,
        answerability: item.answerability,
        judgment,
        judgeUsage,
        judgeElapsedMs,
        gradingError,
      });
      writeJson(`${name}-recording.json`, {
        binding,
        provider: agent.provider,
        model: agent.model,
        judgeProvider: judge.provider,
        judgeModel: judge.model,
        agent: agent.exchanges,
        judge: judge.exchanges,
      });
      writeJson("report.json", {
        schema: 1,
        binding,
        config,
        node: process.version,
        status:
          config.mode === "smoke"
            ? "scripted mechanics only; NOT model quality"
            : "uncalibrated development evaluation; human review pending",
        apiCalls: config.mode === "live" ? allowance.calls : 0,
        allowance,
        summary: summarizeAgentRuns(
          records,
          config.live?.agent.rates ?? null,
          config.live?.judge.rates ?? null,
        ),
        cases: records.map((record) => ({
          itemId: record.run.itemId,
          trial: record.run.trial,
          stop: record.run.turns.at(-1)?.result.stop,
          scores: record.judgment ? scoreAnswer(record.judgment) : null,
          gradingError: record.gradingError,
        })),
      });
      console.log(`${name}: ${run.turns.at(-1)?.result.stop}; ${judgment ? "graded" : "ungraded"}`);
    }
  }
  console.log(`Evaluation artifacts: ${out}; API calls: ${allowance.calls}`);
  expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
  expect(failures, "Invalid/failed judgments remain in the report denominators").toEqual([]);

  function writeJson(file: string, value: unknown) {
    writeFileSync(path.join(out, file), `${JSON.stringify(value, null, 2)}\n`);
  }
}, 7_200_000);

function apiKey(provider: ProviderId): string {
  const key = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!key)
    throw new Error(
      `Missing ${provider.toUpperCase()}_API_KEY; keys are never read from vault notes`,
    );
  return key;
}
