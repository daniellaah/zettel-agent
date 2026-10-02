import { judgeIndexed } from "./indexed-scoring";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createProvider } from "../src/agent/providers/index";
import { runAgentCase, type AgentRun } from "./agent-runner";
import { JudgeOutputError, scoreAnswer, type Judgment } from "./answer-scoring";
import { sumUsage, summarizeAgentRuns, type GradedRun } from "./agent-report";
import { runBaselineCase } from "./baselines";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { comparisonSummary, fullPlan, type CompletedJob } from "./full-plan";
import { RecordedProvider } from "./model-recording";
import { robustnessInterfaceChecks, robustnessTask, type RobustCase } from "./robustness";
import { runConfig } from "./run-config";
import { sha256, validateSets, validateSnapshot, readSnapshot } from "./validate";

/** Provider-credit recovery: immutable old answers, one declared new grader for ALL primary scores. */
it("completes the original frozen plan with a separately priced uniform replacement grader", async () => {
  const config = runConfig(process.env);
  if (!config.live || config.ids.length || config.repeats !== 1)
    throw new Error("Continuation requires explicit live config and the original full plan");
  const source = path.resolve(process.env.EVAL_FULL_SOURCE_DIR ?? "");
  const artifacts = path.join(import.meta.dirname, "artifacts");
  if (!source.startsWith(`${artifacts}/`))
    throw new Error("Source must be a saved full evaluation artifact directory");
  const original = JSON.parse(readFileSync(path.join(source, "report.json"), "utf8")) as {
    binding: {
      corpusHash: string;
      sourceAuditSha256: string;
      answersSha256: string;
      retrievalSha256: string;
      freezeSha256: string;
      robustnessSha256: string;
      implementation: Record<string, string>;
    };
    allowance: SpendingAllowance;
    config: ReturnType<typeof runConfig>;
  };
  const root = path.resolve(import.meta.dirname, "..");
  for (const [file, hash] of Object.entries(original.binding.implementation))
    expect(sha256(readFileSync(path.join(root, file), "utf8"))).toBe(hash);
  if (JSON.stringify(original.config.live?.agent) !== JSON.stringify(config.live.agent))
    throw new Error(
      "Solver model or rates changed; this is not a continuation of the same agent baseline",
    );
  const data = loadEvaluationData("expanded");
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  expect(validateSets(data.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
  expect(data.manifest.corpusHash).toBe(original.binding.corpusHash);
  expect(sha256(readFileSync(data.files.answers, "utf8"))).toBe(original.binding.answersSha256);
  expect(sha256(readFileSync(data.files.retrieval, "utf8"))).toBe(original.binding.retrievalSha256);
  expect(
    sha256(readFileSync(path.join(path.dirname(data.files.answers), "freeze.json"), "utf8")),
  ).toBe(original.binding.freezeSha256);
  expect(sha256(readFileSync(path.join(root, "fixtures/technical-note-audit.json"), "utf8"))).toBe(
    original.binding.sourceAuditSha256,
  );
  const robustPath = path.join(import.meta.dirname, "robustness/cases.json");
  expect(sha256(readFileSync(robustPath, "utf8"))).toBe(original.binding.robustnessSha256);
  const robust = (JSON.parse(readFileSync(robustPath, "utf8")) as { cases: RobustCase[] }).cases;
  const plan = fullPlan(data.answers.items, robust);
  const binding = {
    original: original.binding,
    sourceReportSha256: sha256(readFileSync(path.join(source, "report.json"), "utf8")),
    indexedScoringSha256: sha256(
      readFileSync(path.join(import.meta.dirname, "indexed-scoring.ts"), "utf8"),
    ),
    continuationSha256: sha256(
      readFileSync(path.join(import.meta.dirname, "indexed.run.ts"), "utf8"),
    ),
    config,
  };
  const out = path.join(
    artifacts,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-full-indexed-live`,
  );
  mkdirSync(out, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  const allowance: SpendingAllowance = {
    limitUsd: config.live.maxUsd,
    accountedUsd: 0,
    calls: 0,
    maxCalls: config.live.maxCalls,
  };
  const completed: CompletedJob[] = [];
  let halt = false;
  const rates = { agent: config.live.agent.rates, judge: config.live.judge.rates };
  write("plan.json", {
    binding,
    source,
    jobs: plan.map((j) => ({
      name: j.name,
      itemId: j.item.id,
      variant: j.variant,
      trial: j.trial,
      group: j.group,
    })),
    reason:
      "Original Anthropic judge exhausted provider credits. Preserve all originals; grade all 86 answers with one replacement model to avoid mixed primary scores. Indexed paragraph-unit grading requires all factual clauses to be supported; same-model grading has correlated-error risk and is explicitly provisional.",
  });
  report();
  for (const group of ["dev", "robustness", "test"] as const) {
    const work = plan.filter((j) => j.group === group);
    let next = 0;
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (!halt && next < work.length) {
          const job = work[next++]!;
          const taskCorpus = job.robust ? robustnessTask(job.robust).corpus : corpus;
          const previousPath = path.join(source, `${job.name}-result.json`);
          const previous = existsSync(previousPath)
            ? (JSON.parse(readFileSync(previousPath, "utf8")) as {
                binding: unknown;
                record: GradedRun;
              })
            : null;
          if (previous && JSON.stringify(previous.binding) !== JSON.stringify(original.binding))
            throw new Error("Original case binding mismatch");
          const make = (role: "agent" | "judge") => {
            const model = config.live![role];
            const key = process.env[`${model.provider.toUpperCase()}_API_KEY`];
            if (!key) throw new Error(`Missing ${model.provider.toUpperCase()}_API_KEY`);
            return new RecordedProvider(
              new BudgetProvider(
                createProvider(model.provider, key, model.model),
                model.rates,
                allowance,
              ),
            );
          };
          const agent = previous ? null : make("agent");
          let run: AgentRun;
          if (previous) run = previous.record.run;
          else {
            const options = {
              item: job.item,
              corpus: taskCorpus,
              provider: agent!,
              trial: job.trial,
              mode: "live" as const,
              signal: AbortSignal.timeout(300_000),
            };
            run =
              job.variant === "agent"
                ? await runAgentCase(options)
                : await runBaselineCase({ ...options, variant: job.variant });
          }
          write(`${job.name}-run.json`, {
            run,
            sourceRun: previous
              ? {
                  path: path.join(source, `${job.name}-run.json`),
                  sha256: sha256(readFileSync(path.join(source, `${job.name}-run.json`), "utf8")),
                }
              : null,
          });
          const judge = make("judge");
          let judgment: Judgment | null = null;
          let gradingError: string | null = null;
          const start = performance.now();
          try {
            const graded = await judgeIndexed(job.item, run, judge, AbortSignal.timeout(240_000), {
              maxRepairs: 2,
            });
            judgment = graded.judgment;
            write(`${job.name}-judgment.json`, graded);
          } catch (error) {
            gradingError = judge.describeError(error);
            write(`${job.name}-grading-error.json`, {
              error: gradingError,
              attempts: error instanceof JudgeOutputError ? error.attempts : [],
            });
          }
          const record: GradedRun = {
            run,
            agentUsage: previous
              ? (previous.record.agentUsage ??
                sumUsage(previous.record.run.turns.map((turn) => turn.result.usage)))
              : sumUsage(agent!.exchanges.map((e) => e.response.usage)),
            targetQuestion: job.item.question,
            answerability: job.item.answerability,
            judgment,
            judgeUsage: sumUsage(judge.exchanges.map((e) => e.response.usage)),
            judgeElapsedMs: performance.now() - start,
            gradingError,
          };
          write(`${job.name}-recording.json`, {
            binding,
            inheritedAgent: previous
              ? {
                  path: path.join(source, `${job.name}-recording.json`),
                  sha256: sha256(
                    readFileSync(path.join(source, `${job.name}-recording.json`), "utf8"),
                  ),
                }
              : null,
            agent: agent?.exchanges ?? [],
            judge: judge.exchanges,
          });
          write(`${job.name}-result.json`, {
            binding,
            record,
            inheritedSourceSha256: previous ? sha256(readFileSync(previousPath, "utf8")) : null,
            originalJudgment: previous?.record.judgment ?? null,
            interfaceChecks: job.robust ? robustnessInterfaceChecks(taskCorpus) : null,
          });
          completed.push({ job, record });
          if (
            gradingError?.includes("allowance exhausted") ||
            run.turns.some((t) => t.result.error?.includes("allowance exhausted"))
          )
            halt = true;
          report();
          console.log(
            `${job.name}: ${run.turns.at(-1)?.result.stop}; ${judgment ? "graded" : "grading failed"}; ${completed.length}/86; accounted $${allowance.accountedUsd.toFixed(4)}`,
          );
        }
      }),
    );
    if (halt) break;
  }
  report();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  console.log(`Continuation artifacts: ${out}`);
  expect(completed.length).toBe(plan.length);
  expect(completed.filter((c) => c.record.gradingError).map((c) => c.job.name)).toEqual([]);

  function report() {
    const ordered = plan.flatMap((j) => completed.filter((c) => c.job.name === j.name));
    const summary = summarizeAgentRuns(
      ordered.map((c) => c.record),
      rates.agent,
      rates.judge,
    );
    const newRecords = ordered
      .filter((c) => !existsSync(path.join(source, `${c.job.name}-result.json`)))
      .map((c) => c.record);
    const newSolverUsd = summarizeAgentRuns(newRecords, rates.agent, null).estimatedAgentUsd;
    const groups = Object.fromEntries(
      (["dev", "test", "robustness"] as const).map((group) => [
        group,
        summarizeAgentRuns(
          ordered
            .filter((c) => c.job.group === group && c.job.variant === "agent" && c.job.trial === 1)
            .map((c) => c.record),
          rates.agent,
          rates.judge,
        ),
      ]),
    );
    const unrun = plan
      .filter((j) => !completed.some((c) => c.job.name === j.name))
      .map((j) => j.name);
    write("report.json", {
      schema: 1,
      binding,
      config,
      source,
      originalAllowance: original.allowance,
      allowance,
      plannedJobs: plan.length,
      completedJobs: completed.length,
      unrun,
      apiCalls: allowance.calls,
      newSolverUsd,
      newJudgeUsd: summary.estimatedJudgeUsd,
      summary,
      stageSummaries: groups,
      comparisons: comparisonSummary(ordered, rates),
      status:
        "Uniform replacement judge; same model as solver, provisional and AI-only. Original independent Anthropic grades and failures retained separately. Inherited solver costs are historical, not new spending.",
      cases: ordered.map((c) => ({
        name: c.job.name,
        itemId: c.job.item.id,
        variant: c.job.variant,
        trial: c.job.trial,
        group: c.job.group,
        stop: c.record.run.turns.at(-1)?.result.stop,
        gradingError: c.record.gradingError,
        scores: c.record.judgment ? scoreAnswer(c.record.judgment) : null,
      })),
    });
    const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
    writeFileSync(
      path.join(out, "report.md"),
      [
        "# Full evaluation continuation",
        "",
        `${completed.length}/86 completed, ${summary.gradedTrials} valid model grades, ${unrun.length} unrun. Replacement judge: ${config.live!.judge.provider}/${config.live!.judge.model}. All primary answers use this one grader, including unchanged inherited answers.`,
        "",
        "The original independent Anthropic judge ran out of credits. All original answers, scores and failures are preserved. The replacement judge uses the same model as the solver; these AI scores have correlated-error risk and do not constitute independent human or blind calibration.",
        "",
        "| Group | Trials | Graded | Strict pass | Median Agent ms | p95 Agent ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...Object.entries(groups).map(
          ([g, s]) =>
            `| ${g} | ${s.trials} | ${s.gradedTrials} | ${pct(s.pilotPassRate)} | ${s.agentLatencyMs.median?.toFixed(0) ?? "—"} | ${s.agentLatencyMs.p95?.toFixed(0) ?? "—"} |`,
        ),
        "",
        `New estimated solver cost $${newSolverUsd?.toFixed(4)}; new grader cost $${summary.estimatedJudgeUsd?.toFixed(4)}. Accounted including unknown failed requests $${allowance.accountedUsd.toFixed(4)} / $${allowance.limitUsd}. Original accounting is separate; do not count inherited solver tokens again as new spending.`,
        "",
        "Paired solver and repeat comparisons are in report.json. All failed grades and unrun jobs remain explicit. Separate Codex AI adjudication diagnostics do not overwrite model decisions.",
        "",
        `Unrun: ${unrun.join(", ") || "none"}.`,
        "",
      ].join("\n"),
    );
  }
}, 14_400_000);
