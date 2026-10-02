import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import type { AgentRun } from "./agent-runner";
import { judgmentSchema, validateJudgment } from "./answer-scoring";
import { calibrationReport, humanReviewSchema, judgmentLabels } from "./calibration";
import { loadEvaluationData } from "./fixture-vault";
import { sha256 } from "./validate";

it("compares completed independent human reviews with the bound judge outputs", () => {
  const root = path.join(import.meta.dirname, "artifacts");
  const dir = path.resolve(process.env.EVAL_REVIEW_DIR ?? "");
  if (!dir.startsWith(`${root}${path.sep}`))
    throw new Error("EVAL_REVIEW_DIR must be a run inside eval/artifacts");
  const answers = loadEvaluationData().answers;
  const reports = [];
  let pending = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith("-human-review.json"))) {
    const review = humanReviewSchema.parse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    if (review.status === "pending") {
      pending++;
      continue;
    }
    const base = file.replace(/-human-review\.json$/, "");
    const run = JSON.parse(readFileSync(path.join(dir, `${base}-run.json`), "utf8")) as AgentRun;
    const raw = JSON.parse(readFileSync(path.join(dir, `${base}-judgment.json`), "utf8")) as {
      judgment: unknown;
    };
    const judgment = judgmentSchema.parse(raw.judgment);
    const item = answers.items.find((entry) => entry.id === run.itemId);
    if (!item) throw new Error(`Unknown reviewed item: ${run.itemId}`);
    expect(validateJudgment(judgment, item, run)).toEqual([]);
    const binding = {
      runSha256: sha256(JSON.stringify(run)),
      judgmentSha256: sha256(JSON.stringify(judgment)),
    };
    for (const quote of review.omittedClaims) {
      if (!run.turns.at(-1)?.result.answer.includes(quote))
        throw new Error("Omitted claim must quote the actual answer");
    }
    reports.push({
      itemId: run.itemId,
      trial: run.trial,
      reviewer: review.reviewer,
      omittedClaims: review.omittedClaims,
      rows: calibrationReport(judgmentLabels(judgment), review, binding),
    });
  }
  writeFileSync(
    path.join(dir, "calibration-report.json"),
    `${JSON.stringify(
      {
        schema: 1,
        status: reports.length
          ? "pilot agreement only; inspect disagreement and sample coverage"
          : "not calibrated; human review pending",
        reviewed: reports.length,
        pending,
        reports,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Human reviews: ${reports.length} completed, ${pending} pending.`);
  expect(reports.length, "No completed human review: cannot claim calibration").toBeGreaterThan(0);
});
