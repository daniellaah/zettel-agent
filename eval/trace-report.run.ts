import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { it } from "vitest";
import { annotationHashes, readCompletedRun } from "./completed-run";
import { evaluationFiles, loadEvaluationData } from "./fixture-vault";
import { fullPlan, type PlannedJob } from "./full-plan";
import { reportDestination } from "./report-destination";
import type { RobustCase } from "./robustness";
import {
  compareDiagnoses,
  diagnoseTrace,
  summarizeDiagnoses,
  type UnitFinding,
} from "./trace-diagnosis";
import { sha256 } from "./validate";

// Free and offline: where development Agent runs of a completed full evaluation go wrong.
it("diagnoses the development traces of a completed evaluation", async () => {
  const artifacts = path.join(import.meta.dirname, "artifacts");
  const source = path.resolve(process.env.EVAL_TRACE_SOURCE ?? "");
  if (!source.startsWith(`${artifacts}/`))
    throw new Error("Set EVAL_TRACE_SOURCE to a completed full evaluation under eval/artifacts");

  const robustPath = path.join(import.meta.dirname, "robustness/cases.json");
  const robustness = (JSON.parse(readFileSync(robustPath, "utf8")) as { cases: RobustCase[] })
    .cases;
  const plan = fullPlan(loadEvaluationData("expanded").answers.items, robustness);
  // Held-out and comparator jobs are counted, never diagnosed: their failures must not steer the harness.
  const inScope = (job: PlannedJob) => job.group === "dev" && job.variant === "agent";

  const diagnose = (dir: string) => {
    // Diagnoses are read against today's labels, so they must be the labels the run was graded on.
    const saved = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as {
      binding: unknown;
      config?: { live?: { agent: { model: string }; judge: { model: string } } | null };
    };
    const bound = annotationHashes(saved.binding);
    if (sha256(readFileSync(evaluationFiles("expanded").answers, "utf8")) !== bound.answersSha256)
      throw new Error(`Answer annotations changed since ${path.basename(dir)}`);
    if (sha256(readFileSync(robustPath, "utf8")) !== bound.robustnessSha256)
      throw new Error(`Robustness cases changed since ${path.basename(dir)}`);
    const { jobs, missing } = readCompletedRun(dir, artifacts, plan);
    const skipped = jobs
      .filter(({ job }) => !inScope(job))
      .reduce<Record<string, number>>((counts, { job }) => {
        const key = `${job.group}/${job.variant}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
    const rows = jobs
      .filter(({ job }) => inScope(job))
      .map(({ job, record, exchanges, grading }) =>
        diagnoseTrace({ job: job.name, item: job.item, record, exchanges, grading }),
      );
    const missingInScope = missing.filter((name) =>
      plan.some((j) => j.name === name && inScope(j)),
    );
    const models = saved.config?.live
      ? { agent: saved.config.live.agent.model, judge: saved.config.live.judge.model }
      : { agent: "scripted", judge: "scripted" };
    return { run: path.basename(dir), rows, skipped, missing: missingInScope, models };
  };
  const { run, rows, skipped, missing, models } = diagnose(source);
  const baselineDir = process.env.EVAL_TRACE_BASELINE
    ? path.resolve(process.env.EVAL_TRACE_BASELINE)
    : null;
  if (baselineDir && !baselineDir.startsWith(`${artifacts}/`))
    throw new Error("EVAL_TRACE_BASELINE must be a completed full evaluation under eval/artifacts");
  const baseline = baselineDir ? diagnose(baselineDir) : null;
  const comparison = baseline ? compareDiagnoses(baseline.rows, rows) : null;
  const summary = summarizeDiagnoses(rows);
  const report = {
    schema: 1,
    apiCalls: 0,
    source: run,
    models,
    scope: "Development Agent jobs, every trial",
    skipped,
    missing,
    implementationSha256: sha256(
      readFileSync(path.join(import.meta.dirname, "trace-diagnosis.ts"), "utf8"),
    ),
    summary,
    baseline: baseline && {
      source: baseline.run,
      models: baseline.models,
      missing: baseline.missing,
      comparison,
    },
    rows,
  };

  const destination = reportDestination(
    import.meta.dirname,
    process.env.EVAL_REPORT_DIR ?? path.join(import.meta.dirname, "reports/trace-v1"),
  );
  await mkdir(destination, { recursive: true });
  await writeFile(
    path.join(destination, "trace-report.json"),
    await format(JSON.stringify(report), { parser: "json" }),
  );

  const share = (n: number, d: number) => (d ? `${n}/${d} (${((n / d) * 100).toFixed(0)}%)` : "—");
  const clip = (value: string, max: number) => {
    const flat = value.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  };
  const citations = (unit: UnitFinding) =>
    unit.citations
      .map(
        (c) =>
          `${c.id} ${c.verdict}${c.bodyRead ? "" : ", body not read"}${c.inFinalContext === false ? ", not in final context" : ""}`,
      )
      .join("; ") || "none";
  const units = rows.flatMap((row) =>
    row.units.map((unit) => ({ job: row.job, repaired: row.grading === "ai-repair", unit })),
  );
  const examples = (failure: string) =>
    units
      .filter(({ unit }) => unit.failure === failure)
      .slice(0, 3)
      .map(
        ({ job, repaired, unit }) =>
          `| ${job} u${unit.unit ?? "?"}${unit.opening ? " (opening)" : ""}${repaired ? " †" : ""} | ${unit.kind} | ${clip(unit.quote, 220)} | ${clip(unit.reason, 260)} | ${citations(unit)} |`,
      );
  const { gate, missedPoints, unitsByKind, opening, citedUnits } = summary;
  const work = summary.process;
  const kinds = (["note", "absence", "general"] as const).map((kind) => {
    const k = unitsByKind[kind];
    return `| ${kind} | ${k.supported} | ${k.uncited} | ${k.partial} | ${k.unsupported} | ${k.contradicted} |`;
  });
  const counted = Object.entries(skipped).map(([key, n]) => `${key} ${n}`);
  const points = (value: number | null) =>
    value === null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} points`;
  const interval = (ci: [number, number] | null) =>
    ci ? `95% bootstrap over items ${points(ci[0])} to ${points(ci[1])}` : "no interval";
  const UNIT_OUTCOMES = ["supported", "uncited", "partial", "unsupported", "contradicted"] as const;
  const compared = comparison
    ? [
        "## Compared with the baseline",
        "",
        `Baseline: \`eval/artifacts/${baseline!.run}\` (agent ${baseline!.models.agent}, judge ${baseline!.models.judge}). ${comparison.paired} jobs paired, ${comparison.graded} graded on both sides. One run on each side, so a single job's change is weak evidence; read the totals and intervals.`,
        "",
        "| Measure | Baseline | This run |",
        "| --- | ---: | ---: |",
        `| Strict passes | ${comparison.passes.before}/${comparison.graded} | ${comparison.passes.after}/${comparison.graded} |`,
        ...Object.keys(comparison.gate.before).map(
          (failure) =>
            `| Gate: ${failure} | ${comparison.gate.before[failure as keyof typeof comparison.gate.before]} | ${comparison.gate.after[failure as keyof typeof comparison.gate.after]} |`,
        ),
        ...UNIT_OUTCOMES.map(
          (outcome) =>
            `| Note and absence units: ${outcome} | ${comparison.units.before[outcome]} | ${comparison.units.after[outcome]} |`,
        ),
        "",
        `Pass rate ${points(comparison.passDelta.delta)} (${interval(comparison.passDelta.ci95 as [number, number] | null)}). Supported share of note units per job ${points(comparison.noteSupportDelta.delta)} (${interval(comparison.noteSupportDelta.ci95 as [number, number] | null)}). Newly passing: ${comparison.fixed.join(", ") || "none"}. No longer passing: ${comparison.broken.join(", ") || "none"}.`,
        "",
      ]
    : [];
  const markdown = [
    "# Trace diagnosis",
    "",
    `Source: \`eval/artifacts/${run}\` (agent ${models.agent}, judge ${models.judge}), read offline with zero API calls. Scope: ${rows.length} development Agent jobs, every trial. Held-out, robustness and comparator jobs are never diagnosed, so their failures do not steer harness changes${counted.length ? `; counted here: ${counted.join(", ")}` : ""}.${missing.length ? ` Missing results: ${missing.join(", ")}.` : ""}`,
    "",
    `Judge-derived categories inherit the judge's limits: ${models.agent === models.judge ? "the solver and judge are the same model, " : ""}${summary.aiRepaired} of these grades are disclosed AI repairs, and nothing is human-calibrated. Delivery, citation-id and process figures are deterministic. Categories are multi-label and descriptive; comparisons between groups are correlations, not causes. Raw traces are \`eval/artifacts/${run}/<job>-result.json\` (local, ignored).`,
    "",
    ...compared,
    "## Strict gate",
    "",
    `${share(summary.passes, summary.graded)} graded jobs pass. Failing conditions:`,
    "",
    "| Condition | Jobs |",
    "| --- | ---: |",
    ...Object.entries(gate).map(([failure, n]) => `| ${failure} | ${n} |`),
    "",
    "## Missed key points by stage",
    "",
    "A missed point is retrieval-stage when no complete support set was delivered as an excerpt or read body, synthesis-stage when one was.",
    "",
    "| Missed points | Support never delivered | Support delivered | No support sets (absence) |",
    "| ---: | ---: | ---: | ---: |",
    `| ${missedPoints.total} | ${missedPoints.supportNotDelivered} | ${missedPoints.supportDelivered} | ${missedPoints.noSupportSets} |`,
    "",
    "## Answer units",
    "",
    "Each paragraph or bullet block is one unit. _Uncited_ fails with no citation; _partial_ and _unsupported_ fail with citations that cover some or none of their clauses.",
    "",
    "| Kind | Supported | Uncited | Partial | Unsupported | Contradicted |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...kinds,
    "",
    "Failing share of note and absence units:",
    "",
    "| Group | Failing units |",
    "| --- | ---: |",
    `| Opening unit | ${share(opening.opening.failing, opening.opening.units)} |`,
    `| Later units | ${share(opening.later.failing, opening.later.units)} |`,
    `| Cited, every cited body read | ${share(citedUnits.everyBodyRead.failing, citedUnits.everyBodyRead.units)} |`,
    `| Cited, some cited body never read | ${share(citedUnits.someBodyUnread.failing, citedUnits.someBodyUnread.units)} |`,
    `| Cited, some citation outside the final context | ${share(citedUnits.someOutsideFinalContext.failing, citedUnits.someOutsideFinalContext.units)} |`,
    "",
    `Citation verdicts: ${summary.citations.supporting} supporting, ${summary.citations.irrelevant} irrelevant, ${summary.citations.unknown} unknown.`,
    "",
    "## Process",
    "",
    `Median ${work.medianRequests} requests, ${work.medianToolCalls} tool calls and ${((work.medianElapsedMs ?? 0) / 1000).toFixed(1)}s per job. ${work.toolErrors} tool errors, ${work.repeatedCalls} exactly repeated calls, ${work.unknownCitations} unknown citation ids, ${work.jobsWithOmittedTurns} jobs with omitted history turns. Stops: ${Object.entries(
      work.stops,
    )
      .map(([stop, n]) => `${stop} ${n}`)
      .join(", ")}.`,
    "",
    "## Examples",
    "",
    "The first three units of each failure type, by job order. Reasons are the judge's; † marks a disclosed AI repair of a failed model grade.",
    "",
    ...(["uncited", "partial", "unsupported", "contradicted"] as const).flatMap((failure) => {
      const lines = examples(failure);
      return lines.length
        ? [
            `### ${failure}`,
            "",
            "| Unit | Kind | Answer text | Judge reason | Citations |",
            "| --- | --- | --- | --- | --- |",
            ...lines,
            "",
          ]
        : [];
    }),
    "## Jobs",
    "",
    "Failing units include absence and general units, which the strict gate's claim support does not count, so a passing job can list some.",
    "",
    "| Job | Pass | Gate failures | Failing units (uncited/partial/unsupported/contradicted) | Missed points | Requests | Tool calls |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
    ...rows.map((row) => {
      const count = (failure: string) => row.units.filter((u) => u.failure === failure).length;
      const missedIds = row.points
        .filter((p) => p.status !== null && p.status !== "covered")
        .map((p) => `${p.id}${p.supportDelivered === false ? " (not retrieved)" : ""}`);
      return `| ${row.job} | ${row.pass === null ? "ungraded" : row.pass ? "yes" : "no"} | ${row.failures.join(", ") || "—"} | ${["uncited", "partial", "unsupported", "contradicted"].map(count).join("/")} | ${missedIds.join(", ") || "—"} | ${row.process.requests} | ${row.process.toolCalls} |`;
    }),
    "",
  ].join("\n");
  await writeFile(
    path.join(destination, "trace-report.md"),
    await format(markdown, { parser: "markdown" }),
  );
  console.log(`${rows.length} traces diagnosed; report ${destination}`);
});
