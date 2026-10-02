import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createProvider } from "../src/agent/providers/index";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import type { AgentRun } from "./agent-runner";
import { judgeAnswer, JudgeOutputError, type Judgment } from "./answer-scoring";
import { sumUsage, summarizeAgentRuns, type GradedRun } from "./agent-report";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { judgmentLabels } from "./calibration";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { RecordedProvider, type ModelExchange } from "./model-recording";
import {
  insideArtifacts,
  regradeConfig,
  sourceBindingSchema,
  validateRegradeSource,
} from "./regrade";
import { selectItems } from "./run-config";
import { smokeJudgment } from "./smoke";
import { readSnapshot, sha256, validateSets, validateSnapshot } from "./validate";

it("regrades bound recorded answers without running the agent", async () => {
  const config = regradeConfig(process.env);
  const artifacts = realpathSync(path.join(import.meta.dirname, "artifacts"));
  const sourceDirs = config.sourceDirs.map((dir) => realpathSync(dir));
  if (
    new Set(sourceDirs).size !== sourceDirs.length ||
    sourceDirs.some((dir) => !insideArtifacts(artifacts, dir))
  )
    throw new Error("Sources must be distinct directories strictly inside eval/artifacts");
  const { manifest, retrieval, answers, files } = loadEvaluationData();
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
  expect(validateSets(manifest, retrieval, answers, corpus)).toEqual([]);
  const root = path.resolve(import.meta.dirname, "..");
  const expected = {
    corpusId: manifest.corpusId,
    corpusHash: manifest.corpusHash,
    sourceAuditSha256: manifest.sourceAuditSha256,
    answersSha256: sha256(readFileSync(files.answers, "utf8")),
  };
  expect(sha256(readFileSync(path.join(root, "fixtures/technical-note-audit.json"), "utf8"))).toBe(
    expected.sourceAuditSha256,
  );
  const selected = selectItems(answers.items, config.split, config.ids);
  // Validate every selected source before dispatching any API request.
  const sources = sourceDirs.flatMap((dir) => {
    const sourceBinding = sourceBindingSchema.parse(
      (JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as { binding: unknown })
        .binding,
    );
    return readdirSync(dir)
      .filter((name) => name.endsWith("-run.json"))
      .flatMap((file) => {
        const runPath = path.join(dir, file);
        if (!insideArtifacts(artifacts, realpathSync(runPath)))
          throw new Error("Source file escapes artifacts");
        const runBytes = readFileSync(runPath, "utf8");
        const run = JSON.parse(runBytes) as AgentRun;
        const item = selected.find((item) => item.id === run.itemId);
        if (!item) return [];
        const base = `${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-${run.trial}`;
        if (file !== `${base}-run.json`)
          throw new Error("Source filename differs from run identity");
        const recordingPath = path.join(dir, `${base}-recording.json`);
        if (!insideArtifacts(artifacts, realpathSync(recordingPath)))
          throw new Error("Recording escapes artifacts");
        const recordingBytes = readFileSync(recordingPath, "utf8");
        const recording = JSON.parse(recordingBytes) as {
          judge: ModelExchange[];
          agent?: ModelExchange[];
        };
        const originalMessage = recording.judge?.[0]?.request.messages[0];
        if (!originalMessage)
          throw new Error("No original judge input: cannot establish answer/delivery binding");
        const originalInput = originalMessage.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        const issues = validateRegradeSource(
          item,
          run,
          sourceBinding,
          expected,
          originalInput,
          recording.agent,
        );
        if (issues.length) throw new Error(`${base}: ${issues.join("; ")}`);
        return [
          { item, run, runPath, runBytes, recordingPath, recordingBytes, sourceBinding, base },
        ];
      });
  });
  if (!sources.length) throw new Error("No selected source runs");
  if (config.ids.some((id) => !sources.some((source) => source.item.id === id)))
    throw new Error("A requested item has no source run");
  if (new Set(sources.map((source) => source.base)).size !== sources.length)
    throw new Error("Duplicate item/trial sources: select the intended original explicitly");
  const graderFiles = [
    "eval/regrade.run.ts",
    "eval/regrade.ts",
    "eval/answer-scoring.ts",
    "eval/budget-provider.ts",
    "eval/model-recording.ts",
    "src/agent/providers/index.ts",
    "src/agent/providers/anthropic.ts",
    "src/agent/providers/chat-completions.ts",
    "src/agent/providers/openai-responses.ts",
    "package-lock.json",
  ];
  const binding = {
    ...expected,
    implementation: Object.fromEntries(
      graderFiles.map((file) => [file, sha256(readFileSync(path.join(root, file), "utf8"))]),
    ),
  };
  const out = path.join(
    artifacts,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-regrade-${config.mode}`,
  );
  mkdirSync(out);
  const allowance: SpendingAllowance = {
    limitUsd: config.live?.maxUsd ?? 0,
    accountedUsd: 0,
    calls: 0,
    maxCalls: config.live?.maxCalls ?? 0,
  };
  const records: GradedRun[] = [];
  const cases: {
    itemId: string;
    trial: number;
    attempts: number;
    firstAttemptValid: boolean;
    gradingError: string | null;
  }[] = [];
  for (const source of sources) {
    const { item, run, base } = source;
    copyFileSync(source.runPath, path.join(out, `${base}-run.json`));
    const judge = new RecordedProvider(
      config.live
        ? new BudgetProvider(
            createProvider(
              config.live.judge.provider,
              process.env[`${config.live.judge.provider.toUpperCase()}_API_KEY`] ||
                (() => {
                  throw new Error("Missing judge API key");
                })(),
              config.live.judge.model,
            ),
            config.live.judge.rates,
            allowance,
          )
        : new ScriptedProvider([[text(JSON.stringify(smokeJudgment(item)))]]),
    );
    const start = performance.now();
    let judgment: Judgment | null = null;
    let gradingError: string | null = null;
    let firstAttemptValid = false;
    try {
      const graded = await judgeAnswer(item, run, judge, AbortSignal.timeout(240_000), {
        maxRepairs: config.maxRepairs,
      });
      judgment = graded.judgment;
      firstAttemptValid = graded.attempts[0]!.issues.length === 0;
      writeJson(`${base}-judgment.json`, graded);
      writeJson(`${base}-human-review.json`, {
        schema: 1,
        runSha256: sha256(JSON.stringify(run)),
        judgmentSha256: sha256(JSON.stringify(judgment)),
        reviewer: "owner",
        status: "pending",
        labels: Object.fromEntries(Object.keys(judgmentLabels(judgment)).map((key) => [key, null])),
        comments: "",
        omittedClaims: [],
      });
      writeJson(`${base}-human-packet.json`, {
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
        runFile: `${base}-run.json`,
        claimsToReview: judgment.claims.map((claim) => ({
          id: claim.id,
          answerQuote: claim.answerQuote,
          kind: claim.kind,
          citations: claim.citations.map((citation) => citation.id),
        })),
        instructions:
          "Review independently before opening the judge output. Assess all factual claims and exact delivered evidence, including missed claims. This is a new judgment of an existing answer, not a fresh agent trial.",
      });
    } catch (error) {
      gradingError = judge.describeError(error);
      writeJson(`${base}-judgment-error.json`, {
        error: gradingError,
        attempts: error instanceof JudgeOutputError ? error.attempts : null,
      });
    }
    const judgeUsage = sumUsage(judge.exchanges.map((exchange) => exchange.response.usage));
    records.push({
      run,
      targetQuestion: item.question,
      answerability: item.answerability,
      judgment,
      judgeUsage,
      judgeElapsedMs: performance.now() - start,
      gradingError,
    });
    cases.push({
      itemId: item.id,
      trial: run.trial,
      attempts: judge.exchanges.length,
      firstAttemptValid,
      gradingError,
    });
    writeJson(`${base}-recording.json`, {
      binding,
      source: {
        directory: path.dirname(source.runPath),
        originalBinding: source.sourceBinding,
        runFileSha256: sha256(source.runBytes),
        recordingFileSha256: sha256(source.recordingBytes),
      },
      judgeProvider: judge.provider,
      judgeModel: judge.model,
      judge: judge.exchanges,
    });
    writeJson("report.json", {
      schema: 1,
      kind: "judge-only-regrade",
      binding,
      config,
      status:
        config.mode === "smoke"
          ? "scripted mechanics only; NOT model quality"
          : "uncalibrated development regrading; human review pending",
      agentApiCalls: 0,
      apiCalls: config.mode === "live" ? allowance.calls : 0,
      allowance,
      sources: sources.map((source) => ({
        itemId: source.item.id,
        trial: source.run.trial,
        directory: path.dirname(source.runPath),
        originalBinding: source.sourceBinding,
        runFileSha256: sha256(source.runBytes),
        recordingFileSha256: sha256(source.recordingBytes),
      })),
      summary: summarizeAgentRuns(records, null, config.live?.judge.rates ?? null),
      firstAttemptValid: cases.filter((entry) => entry.firstAttemptValid).length,
      repairedValid: cases.filter((entry) => !entry.firstAttemptValid && !entry.gradingError)
        .length,
      cases,
    });
    console.log(
      `${base}: ${judgment ? "graded" : "ungraded"}; ${judge.exchanges.length} judge responses`,
    );
  }
  expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
  for (const source of sources) {
    expect(readFileSync(source.runPath, "utf8")).toBe(source.runBytes);
    expect(readFileSync(source.recordingPath, "utf8")).toBe(source.recordingBytes);
  }
  console.log(
    `Regrading artifacts: ${out}; agent API calls: 0; judge API calls: ${allowance.calls}`,
  );
  expect(
    cases.filter((entry) => entry.gradingError),
    "Failed judgments remain in denominators",
  ).toEqual([]);

  function writeJson(file: string, value: unknown) {
    writeFileSync(path.join(out, file), `${JSON.stringify(value, null, 2)}\n`);
  }
}, 7_200_000);
