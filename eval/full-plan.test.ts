import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { fullPlan, comparisonSummary } from "./full-plan";
import { loadEvaluationData } from "./fixture-vault";
import type { RobustCase } from "./robustness";

it("declares all 86 trials, paired comparators and repeats before scores, with held-out tasks last", () => {
  const items = loadEvaluationData("expanded").answers.items;
  const robust = (
    JSON.parse(readFileSync(path.join(import.meta.dirname, "robustness/cases.json"), "utf8")) as {
      cases: RobustCase[];
    }
  ).cases;
  const jobs = fullPlan(items, robust);
  expect(jobs).toHaveLength(86);
  expect(jobs.filter((j) => j.group === "test")).toHaveLength(12);
  expect(jobs.slice(-12).every((j) => j.group === "test")).toBe(true);
  expect(jobs.filter((j) => j.variant === "fixed-retrieval")).toHaveLength(6);
  expect(jobs.filter((j) => j.variant === "no-vault")).toHaveLength(6);
  expect(jobs.filter((j) => j.trial === 2)).toHaveLength(6);
  expect(() =>
    fullPlan(
      items.filter((i) => i.id !== "a02"),
      robust,
    ),
  ).toThrow("Missing development comparison");
  const summary = comparisonSummary([], { agent: null, judge: null });
  expect(
    summary.paired.every((p) => Object.values(p.variants).every((v) => !v.present && !v.pass)),
  ).toBe(true);
  expect(summary.repeats.trials).toBe(0);
  expect(summary.variants["agent"]!.pilotPassRate).toBeNull();
});
