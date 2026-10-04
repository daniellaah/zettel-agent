import type { AnswerItem } from "./agent-runner";
import type { SolverVariant } from "./baselines";
import type { RobustCase } from "./robustness";
import { robustnessTask } from "./robustness";
import { pilotPass, summarizeAgentRuns, type GradedRun } from "./agent-report";
import type { TokenRates } from "./answer-scoring";

export const COMPARISON_IDS = ["a02", "a03", "a04", "a05", "a09", "a10"];
export interface PlannedJob {
  name: string;
  item: AnswerItem;
  variant: SolverVariant;
  trial: number;
  group: "dev" | "test" | "robustness";
  robust: RobustCase | null;
}

/** Predeclared comparisons: no item selection based on observed successes. Test runs last. */
export function fullPlan(items: AnswerItem[], robustness: RobustCase[]): PlannedJob[] {
  const jobs: PlannedJob[] = [];
  const add = (
    item: AnswerItem,
    variant: SolverVariant,
    trial: number,
    group: PlannedJob["group"],
    robust: RobustCase | null = null,
  ) => {
    jobs.push({
      name: `${group}-${variant}-${item.id}-${trial}`,
      item,
      variant,
      trial,
      group,
      robust,
    });
  };
  for (const item of items.filter((i) => i.split === "dev")) add(item, "agent", 1, "dev");
  for (const id of COMPARISON_IDS) {
    const item = items.find((i) => i.id === id && i.split === "dev");
    if (!item) throw new Error(`Missing development comparison: ${id}`);
    add(item, "agent", 2, "dev");
    add(item, "fixed-retrieval", 1, "dev");
    add(item, "no-vault", 1, "dev");
  }
  for (const test of robustness) add(robustnessTask(test).item, "agent", 1, "robustness", test);
  for (const item of items.filter((i) => i.split === "test")) add(item, "agent", 1, "test");
  if (new Set(jobs.map((j) => j.name)).size !== jobs.length)
    throw new Error("Duplicate full-evaluation jobs");
  return jobs;
}
export interface CompletedJob {
  job: PlannedJob;
  record: GradedRun;
}
export function comparisonSummary(
  completed: CompletedJob[],
  rates: { agent: TokenRates | null; judge: TokenRates | null },
) {
  const paired = COMPARISON_IDS.map((id) => ({
    itemId: id,
    variants: Object.fromEntries(
      (["agent", "fixed-retrieval", "no-vault"] as const).map((variant) => {
        const entry = completed.find(
          (c) =>
            c.job.item.id === id &&
            c.job.trial === 1 &&
            c.job.variant === variant &&
            c.job.group === "dev",
        );
        return [
          variant,
          {
            present: !!entry,
            pass: entry ? pilotPass(entry.record) : false,
            latencyMs: entry?.record.run.elapsedMs ?? null,
          },
        ];
      }),
    ),
  }));
  return {
    comparisonItems: COMPARISON_IDS,
    policy:
      "Same six predeclared development items and same model. No-vault and deterministic top-five retrieval use a single request per turn. Agent uses its normal loop. Include missing/failed jobs; small sample, descriptive only.",
    paired,
    variants: Object.fromEntries(
      (["agent", "fixed-retrieval", "no-vault"] as const).map((variant) => [
        variant,
        summarizeAgentRuns(
          completed
            .filter(
              (c) =>
                c.job.group === "dev" &&
                COMPARISON_IDS.includes(c.job.item.id) &&
                c.job.variant === variant &&
                c.job.trial === 1,
            )
            .map((c) => c.record),
          rates.agent,
          rates.judge,
        ),
      ]),
    ),
    repeats: summarizeAgentRuns(
      completed
        .filter(
          (c) =>
            c.job.group === "dev" &&
            COMPARISON_IDS.includes(c.job.item.id) &&
            c.job.variant === "agent",
        )
        .map((c) => c.record),
      rates.agent,
      rates.judge,
    ),
  };
}
