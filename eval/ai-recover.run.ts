import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { fullPlan, comparisonSummary, type CompletedJob } from "./full-plan";
import { type RobustCase } from "./robustness";
import { indexedInput, indexedJudgmentSchema, materializeJudgment } from "./indexed-scoring";
import { validateJudgment, scoreAnswer } from "./answer-scoring";
import { summarizeAgentRuns, type GradedRun } from "./agent-report";
import { sha256, validateSnapshot, readSnapshot } from "./validate";

const reviewSchema = z
  .object({
    schema: z.literal(1),
    reviewerKind: z.literal("ai"),
    reviewer: z.literal("Codex"),
    blinding: z.literal("unblinded"),
    status: z.enum(["draft", "reviewed"]),
    sourceResultFile: z.string(),
    sourceResultSha256: z.string(),
    rawSourceFile: z.string(),
    rawSourceSha256: z.string(),
    sourceRecordingFile: z.string(),
    sourceRecordingSha256: z.string(),
    reviewScope: z.string(),
    changes: z.array(z.string()),
    selection: indexedJudgmentSchema,
  })
  .strict();

it("validates explicitly AI adjudicated repairs without changing original model grades", () => {
  const dir = path.resolve(process.env.EVAL_AI_REVIEW_DIR ?? "");
  const artifacts = path.join(import.meta.dirname, "artifacts");
  if (!dir.startsWith(`${artifacts}/`)) throw new Error("AI review directory outside artifacts");
  const source = path.dirname(dir);
  const report = JSON.parse(readFileSync(path.join(source, "report.json"), "utf8")) as {
    config: {
      live: {
        agent: { rates: { input: number; output: number; cacheRead: number; cacheWrite: number } };
        judge: { rates: { input: number; output: number; cacheRead: number; cacheWrite: number } };
      };
    };
  };
  const data = loadEvaluationData("expanded");
  const corpus = loadFixtureCorpus();
  const robust = (
    JSON.parse(readFileSync(path.join(import.meta.dirname, "robustness/cases.json"), "utf8")) as {
      cases: RobustCase[];
    }
  ).cases;
  const plan = fullPlan(data.answers.items, robust);
  const reviews = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("report"))
    .map((file) => ({
      file,
      review: reviewSchema.parse(JSON.parse(readFileSync(path.join(dir, file), "utf8"))),
    }));
  const recovered: CompletedJob[] = [];
  const pending: string[] = [];
  for (const job of plan) {
    const sourceFile = path.join(source, `${job.name}-result.json`);
    const saved = JSON.parse(readFileSync(sourceFile, "utf8")) as { record: GradedRun };
    const review = reviews.find(
      (r) => path.basename(r.review.sourceResultFile) === path.basename(sourceFile),
    );
    if (review) {
      for (const [file, hash] of [
        [review.review.sourceResultFile, review.review.sourceResultSha256],
        [review.review.rawSourceFile, review.review.rawSourceSha256],
        [review.review.sourceRecordingFile, review.review.sourceRecordingSha256],
      ]) {
        if (!file!.startsWith(`${artifacts}/`) && !path.resolve(file!).startsWith(`${artifacts}/`))
          throw new Error("AI source outside artifact boundary");
        expect(sha256(readFileSync(file!, "utf8"))).toBe(hash);
      }
      const input = indexedInput(job.item, saved.record.run);
      const banks = path.join(dir, "banks");
      mkdirSync(banks, { recursive: true });
      writeFileSync(
        path.join(banks, `${job.name}.json`),
        `${JSON.stringify(input.quotes, null, 2)}\n`,
      );
      const judgment = materializeJudgment(review.review.selection, input);
      const issues = validateJudgment(judgment, job.item, saved.record.run);
      if (issues.length) {
        writeFileSync(path.join(dir, `${job.name}-validation.txt`), issues.join("\n"));
        pending.push(job.name);
        recovered.push({ job, record: saved.record });
        continue;
      }
      if (review.review.status !== "reviewed") pending.push(job.name);
      else {
        const record = { ...saved.record, judgment, gradingError: null };
        recovered.push({ job, record });
        const out = path.join(dir, "validated");
        mkdirSync(out, { recursive: true });
        writeFileSync(
          path.join(out, `${job.name}.json`),
          `${JSON.stringify({ reviewerKind: "ai", reviewSha256: sha256(readFileSync(path.join(dir, review.file), "utf8")), originalGradingError: saved.record.gradingError, originalModelJudgment: saved.record.judgment, judgment, scores: scoreAnswer(judgment), record }, null, 2)}\n`,
        );
        continue;
      }
    }
    recovered.push({ job, record: saved.record });
  }
  const rates = { agent: report.config.live.agent.rates, judge: report.config.live.judge.rates };
  const summary = summarizeAgentRuns(
    recovered.map((r) => r.record),
    rates.agent,
    rates.judge,
  );
  writeFileSync(
    path.join(dir, "report.json"),
    `${JSON.stringify(
      {
        schema: 1,
        apiCalls: 0,
        reviewerKind: "ai",
        humanReviews: 0,
        blinding: "unblinded",
        originalReportSha256: sha256(readFileSync(path.join(source, "report.json"), "utf8")),
        recoveryReviews: reviews.length,
        graderInterfaceSha256: sha256(
          readFileSync(path.join(import.meta.dirname, "indexed-scoring.ts"), "utf8"),
        ),
        reviewed: reviews.filter((r) => r.review.status === "reviewed").length,
        pending,
        summary,
        stageSummaries: Object.fromEntries(
          (["dev", "test", "robustness"] as const).map((group) => [
            group,
            summarizeAgentRuns(
              recovered
                .filter(
                  (r) => r.job.group === group && r.job.variant === "agent" && r.job.trial === 1,
                )
                .map((r) => r.record),
              rates.agent,
              rates.judge,
            ),
          ]),
        ),
        comparisons: comparisonSummary(recovered, rates),
        cases: recovered.map((r) => ({
          name: r.job.name,
          stop: r.record.run.turns.at(-1)?.result.stop,
          scores: r.record.judgment ? scoreAnswer(r.record.judgment) : null,
          gradingError: r.record.gradingError,
        })),
        limitation:
          "Selected structural and grounding adjudications only; remaining model semantic decisions retained. AI-only and unblinded, not human or independent calibration. Historical costs include only the selected grading round; phase budgets/recordings retain all incurred spending.",
      },
      null,
      2,
    )}\n`,
  );
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  console.log(
    `AI recovery: ${reviews.length} records; ${pending.length} pending; ${summary.gradedTrials}/${plan.length} graded`,
  );
});
