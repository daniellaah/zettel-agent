import type { ModelUsage } from "../src/agent/provider";
import type { AgentRun } from "./agent-runner";
import { scoreAnswer, tokenCost, type Judgment, type TokenRates } from "./answer-scoring";

export interface GradedRun {
  run: AgentRun;
  /** Returned provider usage can include a response discarded by the loop after abort. */
  agentUsage?: ModelUsage;
  targetQuestion: string;
  answerability: "answerable" | "partial" | "no-answer";
  judgment: Judgment | null;
  judgeUsage: ModelUsage | null;
  judgeElapsedMs: number | null;
  gradingError: string | null;
}

export function sumUsage(values: ModelUsage[]): ModelUsage {
  return values.reduce(
    (sum, value) => ({
      inputTokens: sum.inputTokens + value.inputTokens,
      outputTokens: sum.outputTokens + value.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + value.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + value.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

export function percentile(values: number[], fraction: number): number | null {
  if (
    fraction < 0 ||
    fraction > 1 ||
    !Number.isFinite(fraction) ||
    values.some((value) => !Number.isFinite(value))
  )
    throw new Error("Invalid percentile input");
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  return sorted[low]! + (sorted[Math.ceil(position)]! - sorted[low]!) * (position - low);
}

/** Descriptive pilot thresholds, not a calibrated universal definition of answer quality. */
export function pilotPass(entry: GradedRun): boolean {
  const final = entry.run.turns.at(-1);
  if (
    !entry.judgment ||
    !final ||
    final.question !== entry.targetQuestion ||
    !["answered", "budget_exhausted"].includes(final.result.stop)
  )
    return false;
  const scores = scoreAnswer(entry.judgment);
  return (
    scores.keyPointCoverage === 1 &&
    (scores.noteClaims > 0 || entry.answerability === "no-answer") &&
    scores.forbiddenViolations === 0 &&
    (scores.claimSupportRate === null || scores.claimSupportRate === 1) &&
    (scores.citationPrecision === null || scores.citationPrecision === 1) &&
    scores.abstention !== "inappropriate"
  );
}

export function summarizeAgentRuns(
  entries: GradedRun[],
  agentRates: TokenRates | null,
  judgeRates: TokenRates | null,
) {
  const agentUsage = sumUsage(
    entries.flatMap((entry) =>
      entry.agentUsage ? [entry.agentUsage] : entry.run.turns.map((turn) => turn.result.usage),
    ),
  );
  const judgeUsage = sumUsage(
    entries.flatMap((entry) => (entry.judgeUsage ? [entry.judgeUsage] : [])),
  );
  const groups = [...new Set(entries.map((entry) => entry.run.itemId))].map((id) => {
    const trials = entries.filter((entry) => entry.run.itemId === id);
    const passes = trials.filter(pilotPass).length;
    return {
      itemId: id,
      trials: trials.length,
      gradedTrials: trials.filter((entry) => entry.judgment).length,
      passes,
      firstTrialPass: pilotPass(trials[0]!),
      anyTrialPass: passes > 0,
      allTrialsPass: passes === trials.length,
    };
  });
  return {
    trials: entries.length,
    gradedTrials: entries.filter((entry) => entry.judgment).length,
    gradingErrors: entries.filter((entry) => entry.gradingError).length,
    targetReached: entries.filter(
      (entry) => entry.run.turns.at(-1)?.question === entry.targetQuestion,
    ).length,
    // Include failures in denominators. Scripted smoke reports must not call these model-quality scores.
    pilotPassRate: entries.length ? entries.filter(pilotPass).length / entries.length : null,
    firstTrialPassRate: groups.length
      ? groups.filter((group) => group.firstTrialPass).length / groups.length
      : null,
    anyTrialPassRate: groups.length
      ? groups.filter((group) => group.anyTrialPass).length / groups.length
      : null,
    allTrialsPassRate: groups.length
      ? groups.filter((group) => group.allTrialsPass).length / groups.length
      : null,
    agentLatencyMs: {
      median: percentile(
        entries.map((entry) => entry.run.elapsedMs),
        0.5,
      ),
      p95: percentile(
        entries.map((entry) => entry.run.elapsedMs),
        0.95,
      ),
    },
    judgeLatencyMs: {
      median: percentile(
        entries.flatMap((entry) => (entry.judgeElapsedMs === null ? [] : [entry.judgeElapsedMs])),
        0.5,
      ),
      p95: percentile(
        entries.flatMap((entry) => (entry.judgeElapsedMs === null ? [] : [entry.judgeElapsedMs])),
        0.95,
      ),
    },
    totalLatencyMs: {
      median: percentile(
        entries.map((entry) => entry.run.elapsedMs + (entry.judgeElapsedMs ?? 0)),
        0.5,
      ),
      p95: percentile(
        entries.map((entry) => entry.run.elapsedMs + (entry.judgeElapsedMs ?? 0)),
        0.95,
      ),
    },
    toolCalls: entries.reduce(
      (sum, entry) => sum + entry.run.turns.reduce((count, turn) => count + turn.calls.length, 0),
      0,
    ),
    requests: entries.reduce(
      (sum, entry) =>
        sum + entry.run.turns.reduce((count, turn) => count + turn.result.usage.requests, 0),
      0,
    ),
    agentUsage,
    judgeUsage,
    estimatedAgentUsd: tokenCost(agentUsage, agentRates),
    estimatedJudgeUsd: tokenCost(judgeUsage, judgeRates),
    groups,
  };
}
