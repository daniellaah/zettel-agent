import { pilotPass, type GradedRun } from "./agent-report";
import type { AnswerItem } from "./agent-runner";
import { supportPoints } from "./answer-retrieval";
import { scoreAnswer, type Judgment } from "./answer-scoring";
import type { GradingSource } from "./completed-run";
import { answerUnits } from "./indexed-scoring";
import type { ModelExchange } from "./model-recording";
import { pairedBootstrap } from "./paired-bootstrap";

/** Why a run failed the strict gate. Mirrors `pilotPass` condition by condition. */
export const GATE_FAILURES = [
  "incomplete",
  "missed-point",
  "no-note-claim",
  "forbidden",
  "ungrounded-claim",
  "bad-citation",
  "abstention",
] as const;
export type GateFailure = (typeof GATE_FAILURES)[number];

type Claim = Judgment["claims"][number];
/** How an answer unit fails its own citations; null when supported. */
export type UnitFailure = "contradicted" | "uncited" | "partial" | "unsupported";

export interface UnitFinding {
  /** Paragraph or bullet block index in the final answer; null if the quote is not found. */
  unit: number | null;
  kind: Claim["kind"];
  verdict: Claim["verdict"];
  failure: UnitFailure | null;
  /** The first factual unit of the answer, typically an opening summary. */
  opening: boolean;
  citations: {
    id: string;
    verdict: Claim["citations"][number]["verdict"];
    /** The note's body was delivered by `read`, not only as a title, excerpt or preview. */
    bodyRead: boolean;
    /** A result delivering it was in the final request; null without a recorded final step. */
    inFinalContext: boolean | null;
  }[];
  quote: string;
  reason: string;
}

export interface TraceDiagnosis {
  job: string;
  itemId: string;
  trial: number;
  grading: GradingSource;
  /** The strict pass; null without a judgment. */
  pass: boolean | null;
  failures: GateFailure[];
  points: {
    id: string;
    status: Judgment["keyPoints"][number]["status"] | null;
    /** Every note of one support set was delivered as an excerpt or read body; null without support sets. */
    supportDelivered: boolean | null;
  }[];
  units: UnitFinding[];
  process: {
    stop: string | null;
    requests: number;
    toolCalls: number;
    toolErrors: number;
    /** Calls repeating an earlier call's tool and input exactly. */
    repeatedCalls: number;
    unknownCitations: number;
    omittedTurns: number;
    elapsedMs: number;
    inputTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
  };
}

export function unitFailure(claim: Claim): UnitFailure | null {
  if (claim.verdict === "supported") return null;
  if (claim.verdict === "contradicted") return "contradicted";
  return claim.citations.length === 0 ? "uncited" : claim.verdict;
}

/**
 * Where one graded run went wrong: which gate conditions failed, whether missed key points were
 * ever retrieved, and how each answer unit relates to the evidence it cites. Judge-derived fields
 * inherit the judge's limits; delivery, citation-id and process fields are deterministic.
 */
export function diagnoseTrace(options: {
  job: string;
  item: AnswerItem;
  record: GradedRun;
  exchanges: ModelExchange[];
  grading: GradingSource;
}): TraceDiagnosis {
  const { item, record } = options;
  const { run, judgment } = record;
  const calls = run.turns.flatMap((turn) => turn.calls);
  const final = run.turns.at(-1);

  const delivered = new Set(
    calls.flatMap((call) =>
      call.exposures
        .filter((span) => span.scope === "search-excerpt" || span.scope === "read-body")
        .map((span) => span.path),
    ),
  );
  const support = new Map(
    supportPoints(item).map((point) => [
      point.id,
      point.sets.some((set) => set.every((path) => delivered.has(path))),
    ]),
  );
  const points = item.keyPoints.map((point) => ({
    id: point.id,
    status: judgment?.keyPoints.find((entry) => entry.id === point.id)?.status ?? null,
    supportDelivered: support.get(point.id) ?? null,
  }));

  const failures: GateFailure[] = [];
  if (
    !final ||
    final.question !== record.targetQuestion ||
    !["answered", "budget_exhausted"].includes(final.result.stop)
  )
    failures.push("incomplete");
  if (judgment) {
    const scores = scoreAnswer(judgment);
    if (scores.keyPointCoverage < 1) failures.push("missed-point");
    if (scores.noteClaims === 0 && record.answerability !== "no-answer")
      failures.push("no-note-claim");
    if (scores.forbiddenViolations > 0) failures.push("forbidden");
    if (scores.claimSupportRate !== null && scores.claimSupportRate < 1)
      failures.push("ungrounded-claim");
    if (scores.citationPrecision !== null && scores.citationPrecision < 1)
      failures.push("bad-citation");
    if (scores.abstention === "inappropriate") failures.push("abstention");
  }
  const pass = judgment ? pilotPass(record) : null;
  if (pass !== null && pass !== (failures.length === 0))
    throw new Error(`${options.job}: diagnosis disagrees with the strict gate`);

  // Evidence ids to the calls that delivered them, and the calls whose results the final request held.
  const deliveringCalls = new Map<string, string[]>();
  for (const call of calls)
    for (const span of call.exposures)
      deliveringCalls.set(span.id, [...(deliveringCalls.get(span.id) ?? []), call.id]);
  const finalRequest = options.exchanges.at(-1)?.request;
  const inFinal = finalRequest
    ? new Set(
        finalRequest.messages.flatMap((message) =>
          message.role === "user"
            ? message.parts.flatMap((part) => (part.type === "tool_result" ? [part.callId] : []))
            : [],
        ),
      )
    : null;
  const bodyRead = new Set(
    calls.flatMap((call) =>
      call.exposures.filter((span) => span.scope === "read-body").map((span) => span.id),
    ),
  );
  const answer = answerUnits(final?.result.answer ?? "");
  const claims = judgment?.claims ?? [];
  const unitOf = (claim: Claim) => {
    const index = answer.findIndex((unit) => unit.quote === claim.answerQuote);
    return index < 0 ? null : index;
  };
  const indices = claims.map(unitOf).filter((index) => index !== null);
  const opening = indices.length ? Math.min(...indices) : null;
  const units = claims.map((claim) => {
    const unit = unitOf(claim);
    return {
      unit,
      kind: claim.kind,
      verdict: claim.verdict,
      failure: unitFailure(claim),
      opening: unit !== null && unit === opening,
      citations: claim.citations.map((citation) => ({
        id: citation.id,
        verdict: citation.verdict,
        bodyRead: bodyRead.has(citation.id),
        inFinalContext: inFinal
          ? (deliveringCalls.get(citation.id) ?? []).some((id) => inFinal.has(id))
          : null,
      })),
      quote: claim.answerQuote,
      reason: claim.reason,
    };
  });

  const seen = new Set<string>();
  let repeatedCalls = 0;
  for (const call of calls) {
    const key = `${call.name}\u0000${JSON.stringify(call.input)}`;
    if (seen.has(key)) repeatedCalls++;
    seen.add(key);
  }
  const sum = (pick: (usage: (typeof run.turns)[number]["result"]["usage"]) => number) =>
    run.turns.reduce((total, turn) => total + pick(turn.result.usage), 0);
  return {
    job: options.job,
    itemId: item.id,
    trial: run.trial,
    grading: options.grading,
    pass,
    failures,
    points,
    units,
    process: {
      stop: final?.result.stop ?? null,
      requests: sum((usage) => usage.requests),
      toolCalls: calls.length,
      toolErrors: calls.filter((call) => call.outcome?.isError).length,
      repeatedCalls,
      unknownCitations: final?.result.citations.unknown.length ?? 0,
      omittedTurns: Math.max(0, ...run.turns.map((turn) => turn.result.context?.omittedTurns ?? 0)),
      elapsedMs: run.elapsedMs,
      inputTokens: sum((usage) => usage.inputTokens),
      cacheReadTokens: sum((usage) => usage.cacheReadTokens),
      outputTokens: sum((usage) => usage.outputTokens),
    },
  };
}

const OUTCOMES = ["supported", "uncited", "partial", "unsupported", "contradicted"] as const;
type Outcome = (typeof OUTCOMES)[number];
const tally = () => Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;

/** Counts behind the report. Categories are multi-label, so job counts do not sum to the total. */
export function summarizeDiagnoses(rows: readonly TraceDiagnosis[]) {
  const graded = rows.filter((row) => row.pass !== null);
  const points = rows.flatMap((row) => row.points);
  const missed = points.filter((point) => point.status !== null && point.status !== "covered");
  const grounded = rows.flatMap((row) => row.units.filter((unit) => unit.kind !== "general"));
  const byKind = { note: tally(), absence: tally(), general: tally() };
  for (const unit of rows.flatMap((row) => row.units))
    byKind[unit.kind][unit.failure ?? "supported"]++;
  const failing = (units: UnitFinding[]) => ({
    units: units.length,
    failing: units.filter((unit) => unit.failure !== null).length,
  });
  const cited = grounded.filter((unit) => unit.citations.length > 0);
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  };
  return {
    jobs: rows.length,
    graded: graded.length,
    passes: graded.filter((row) => row.pass).length,
    aiRepaired: rows.filter((row) => row.grading === "ai-repair").length,
    gate: Object.fromEntries(
      GATE_FAILURES.map((failure) => [
        failure,
        rows.filter((row) => row.failures.includes(failure)).length,
      ]),
    ) as Record<GateFailure, number>,
    missedPoints: {
      total: missed.length,
      supportNotDelivered: missed.filter((point) => point.supportDelivered === false).length,
      supportDelivered: missed.filter((point) => point.supportDelivered === true).length,
      noSupportSets: missed.filter((point) => point.supportDelivered === null).length,
    },
    unitsByKind: byKind,
    opening: {
      opening: failing(grounded.filter((unit) => unit.opening)),
      later: failing(grounded.filter((unit) => !unit.opening)),
    },
    citedUnits: {
      everyBodyRead: failing(cited.filter((unit) => unit.citations.every((c) => c.bodyRead))),
      someBodyUnread: failing(cited.filter((unit) => unit.citations.some((c) => !c.bodyRead))),
      someOutsideFinalContext: failing(
        cited.filter((unit) => unit.citations.some((c) => c.inFinalContext === false)),
      ),
    },
    citations: Object.fromEntries(
      (["supporting", "irrelevant", "unknown"] as const).map((verdict) => [
        verdict,
        grounded.flatMap((unit) => unit.citations).filter((c) => c.verdict === verdict).length,
      ]),
    ) as Record<"supporting" | "irrelevant" | "unknown", number>,
    process: {
      medianRequests: median(rows.map((row) => row.process.requests)),
      medianToolCalls: median(rows.map((row) => row.process.toolCalls)),
      medianElapsedMs: median(rows.map((row) => row.process.elapsedMs)),
      toolErrors: rows.reduce((sum, row) => sum + row.process.toolErrors, 0),
      repeatedCalls: rows.reduce((sum, row) => sum + row.process.repeatedCalls, 0),
      unknownCitations: rows.reduce((sum, row) => sum + row.process.unknownCitations, 0),
      jobsWithOmittedTurns: rows.filter((row) => row.process.omittedTurns > 0).length,
      stops: rows.reduce<Record<string, number>>((counts, row) => {
        const stop = row.process.stop ?? "none";
        counts[stop] = (counts[stop] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}

/** Share of note units that are supported; null without note units. */
export function noteSupport(row: TraceDiagnosis): number | null {
  const notes = row.units.filter((unit) => unit.kind === "note");
  return notes.length ? notes.filter((unit) => unit.failure === null).length / notes.length : null;
}

/**
 * Pairs a candidate run with a baseline by job. Pass and note-support deltas are bootstrapped
 * over items, so a task's repeated trials move together. Descriptive: one run of each side.
 */
export function compareDiagnoses(
  baseline: readonly TraceDiagnosis[],
  candidate: readonly TraceDiagnosis[],
) {
  const before = new Map(baseline.map((row) => [row.job, row]));
  const pairs = candidate.flatMap((after) => {
    const previous = before.get(after.job);
    return previous ? [{ before: previous, after }] : [];
  });
  const graded = pairs.filter(({ before, after }) => before.pass !== null && after.pass !== null);
  const units = (side: "before" | "after") => {
    const counts = tally();
    for (const pair of graded)
      for (const unit of pair[side].units.filter((u) => u.kind !== "general"))
        counts[unit.failure ?? "supported"]++;
    return counts;
  };
  const gate = (side: "before" | "after") =>
    Object.fromEntries(
      GATE_FAILURES.map((failure) => [
        failure,
        graded.filter((pair) => pair[side].failures.includes(failure)).length,
      ]),
    ) as Record<GateFailure, number>;
  const bootstrap = (score: (row: TraceDiagnosis) => number | null) =>
    pairedBootstrap(
      graded.map(({ before, after }) => ({
        group: before.itemId,
        baseline: score(before),
        candidate: score(after),
      })),
    );
  return {
    paired: pairs.length,
    graded: graded.length,
    unpaired: candidate.filter((row) => !before.has(row.job)).map((row) => row.job),
    passes: {
      before: graded.filter((pair) => pair.before.pass).length,
      after: graded.filter((pair) => pair.after.pass).length,
    },
    fixed: graded.filter((pair) => !pair.before.pass && pair.after.pass).map((p) => p.after.job),
    broken: graded.filter((pair) => pair.before.pass && !pair.after.pass).map((p) => p.after.job),
    passDelta: bootstrap((row) => (row.pass ? 1 : 0)),
    noteSupportDelta: bootstrap(noteSupport),
    gate: { before: gate("before"), after: gate("after") },
    units: { before: units("before"), after: units("after") },
  };
}
