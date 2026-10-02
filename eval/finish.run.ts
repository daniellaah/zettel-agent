import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createProvider } from "../src/agent/providers/index";
import { runAgentCase } from "./agent-runner";
import { JudgeOutputError, scoreAnswer } from "./answer-scoring";
import { judgeIndexed } from "./indexed-scoring";
import { sumUsage, summarizeAgentRuns, type GradedRun } from "./agent-report";
import { runBaselineCase } from "./baselines";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { comparisonSummary, fullPlan, type CompletedJob } from "./full-plan";
import { RecordedProvider } from "./model-recording";
import { robustnessInterfaceChecks, robustnessTask, type RobustCase } from "./robustness";
import { runConfig } from "./run-config";
import { sha256, validateSets, validateSnapshot, readSnapshot } from "./validate";

it("finishes unrun jobs without selecting successful trials or replacing original failures", async () => {
  const config = runConfig(process.env);
  if (!config.live || config.ids.length || config.repeats !== 1)
    throw new Error("Explicit live full-plan config required");
  const source = path.resolve(process.env.EVAL_FULL_SOURCE_DIR ?? "");
  if (!source.startsWith(`${path.join(import.meta.dirname, "artifacts")}/`))
    throw new Error("Source outside evaluation artifacts");
  const original = JSON.parse(readFileSync(path.join(source, "report.json"), "utf8")) as {
    binding: {
      original: {
        implementation: Record<string, string>;
        corpusHash: string;
        answersSha256: string;
        retrievalSha256: string;
        freezeSha256: string;
        robustnessSha256: string;
        sourceAuditSha256: string;
      };
      indexedScoringSha256: string;
    };
    config: typeof config;
    allowance: SpendingAllowance;
    source: string;
  };
  const root = path.resolve(import.meta.dirname, "..");
  for (const [file, hash] of Object.entries(original.binding.original.implementation))
    expect(sha256(readFileSync(path.join(root, file), "utf8"))).toBe(hash);
  expect(sha256(readFileSync(path.join(import.meta.dirname, "indexed-scoring.ts"), "utf8"))).toBe(
    original.binding.indexedScoringSha256,
  );
  expect(config.live.agent).toEqual(original.config.live!.agent);
  expect(config.live.judge).toEqual(original.config.live!.judge);
  const data = loadEvaluationData("expanded");
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  expect(validateSets(data.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
  expect(data.manifest.corpusHash).toBe(original.binding.original.corpusHash);
  expect(sha256(readFileSync(data.files.answers, "utf8"))).toBe(
    original.binding.original.answersSha256,
  );
  expect(sha256(readFileSync(data.files.retrieval, "utf8"))).toBe(
    original.binding.original.retrievalSha256,
  );
  expect(
    sha256(readFileSync(path.join(path.dirname(data.files.answers), "freeze.json"), "utf8")),
  ).toBe(original.binding.original.freezeSha256);
  expect(sha256(readFileSync(path.join(root, "fixtures/technical-note-audit.json"), "utf8"))).toBe(
    original.binding.original.sourceAuditSha256,
  );
  const robustPath = path.join(import.meta.dirname, "robustness/cases.json");
  expect(sha256(readFileSync(robustPath, "utf8"))).toBe(original.binding.original.robustnessSha256);
  const robust = (JSON.parse(readFileSync(robustPath, "utf8")) as { cases: RobustCase[] }).cases;
  const plan = fullPlan(data.answers.items, robust);
  const out = path.join(
    import.meta.dirname,
    "artifacts",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-full-finish-live`,
  );
  mkdirSync(out, { recursive: true });
  const binding = {
    parent: original.binding,
    parentReportSha256: sha256(readFileSync(path.join(source, "report.json"), "utf8")),
    finishSha256: sha256(readFileSync(path.join(import.meta.dirname, "finish.run.ts"), "utf8")),
    config,
  };
  const write = (name: string, value: unknown) =>
    writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  const allowance: SpendingAllowance = {
    limitUsd: config.live.maxUsd,
    accountedUsd: 0,
    calls: 0,
    maxCalls: config.live.maxCalls,
  };
  const completed: CompletedJob[] = [];
  const work = [];
  const resumeDir = process.env.EVAL_FINISH_RESUME_DIR
    ? path.resolve(process.env.EVAL_FINISH_RESUME_DIR)
    : null;
  if (resumeDir && !resumeDir.startsWith(`${path.join(import.meta.dirname, "artifacts")}/`))
    throw new Error("Resume source outside artifacts");
  if (resumeDir) {
    const prior = JSON.parse(readFileSync(path.join(resumeDir, "report.json"), "utf8")) as {
      binding: { parent: unknown };
      config: typeof config;
      allowance: SpendingAllowance;
    };
    if (JSON.stringify(prior.binding.parent) !== JSON.stringify(original.binding))
      throw new Error("Finish resume parent binding changed");
    expect(prior.config.live!.agent).toEqual(config.live.agent);
    expect(prior.config.live!.judge).toEqual(config.live.judge);
    write("resume-source.json", {
      directory: resumeDir,
      reportSha256: sha256(readFileSync(path.join(resumeDir, "report.json"), "utf8")),
      allowance: prior.allowance,
    });
  }
  for (const job of plan) {
    const savedFile = resumeDir ? path.join(resumeDir, `${job.name}-result.json`) : null;
    if (savedFile && existsSync(savedFile)) {
      const saved = JSON.parse(readFileSync(savedFile, "utf8")) as {
        record: GradedRun;
        interfaceChecks: unknown;
        binding: { parent: unknown };
      };
      if (JSON.stringify(saved.binding.parent) !== JSON.stringify(original.binding))
        throw new Error("Resume case parent binding changed");
      write(`${job.name}-result.json`, {
        binding,
        record: saved.record,
        inherited: { path: savedFile, sha256: sha256(readFileSync(savedFile, "utf8")) },
        interfaceChecks: saved.interfaceChecks,
      });
      completed.push({ job, record: saved.record });
      continue;
    }
    const file = path.join(source, `${job.name}-result.json`);
    const previous = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as {
          binding: unknown;
          record: GradedRun;
          interfaceChecks: unknown;
        })
      : null;
    if (previous && JSON.stringify(previous.binding) !== JSON.stringify(original.binding))
      throw new Error("Source case binding changed");
    if (previous?.record.judgment) {
      write(`${job.name}-result.json`, {
        binding,
        record: previous.record,
        inherited: { path: file, sha256: sha256(readFileSync(file, "utf8")) },
        interfaceChecks: previous.interfaceChecks,
      });
      completed.push({ job, record: previous.record });
    } else work.push({ job, previous, file });
  }
  report();
  // Single worker avoids treating another in-flight reservation as spent capacity.
  for (const { job, previous, file } of work) {
    const taskCorpus = job.robust ? robustnessTask(job.robust).corpus : corpus;
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
    const options = {
      item: job.item,
      corpus: taskCorpus,
      provider: agent!,
      trial: job.trial,
      mode: "live" as const,
      signal: AbortSignal.timeout(300_000),
    };
    const run =
      previous?.record.run ??
      (job.variant === "agent"
        ? await runAgentCase(options)
        : await runBaselineCase({ ...options, variant: job.variant }));
    const judge = make("judge");
    let judgment = null;
    let gradingError: string | null = null;
    const start = performance.now();
    try {
      const graded = await judgeIndexed(job.item, run, judge, AbortSignal.timeout(240_000), {
        maxRepairs: 0,
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
      agentUsage:
        previous?.record.agentUsage ??
        sumUsage(
          agent?.exchanges.map((e) => e.response.usage) ?? run.turns.map((t) => t.result.usage),
        ),
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
            sha256: sha256(readFileSync(path.join(source, `${job.name}-recording.json`), "utf8")),
          }
        : null,
      agent: agent?.exchanges ?? [],
      judge: judge.exchanges,
    });
    write(`${job.name}-result.json`, {
      binding,
      record,
      sourceResult: previous ? { path: file, sha256: sha256(readFileSync(file, "utf8")) } : null,
      originalGradingError: previous?.record.gradingError ?? null,
      originalJudgeUsage: previous?.record.judgeUsage ?? null,
      interfaceChecks: job.robust ? robustnessInterfaceChecks(taskCorpus) : null,
    });
    completed.push({ job, record });
    report();
    console.log(
      `${job.name}: ${run.turns.at(-1)?.result.stop}; ${judgment ? "graded" : "grading failed"}; ${completed.length}/86; $${allowance.accountedUsd.toFixed(4)}`,
    );
    if (
      gradingError?.includes("allowance exhausted") ||
      (!previous && run.turns.some((t) => t.result.error?.includes("allowance exhausted")))
    )
      break;
  }
  report();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  console.log(`Finish artifacts: ${out}`);
  expect(completed.length).toBe(plan.length);
  // A grading failure is reported separately from Agent quality and never silently becomes a pass.
  function report() {
    const ordered = plan.flatMap((j) => completed.filter((c) => c.job.name === j.name));
    const rates = { agent: config.live!.agent.rates, judge: config.live!.judge.rates };
    const summary = summarizeAgentRuns(
      ordered.map((c) => c.record),
      rates.agent,
      rates.judge,
    );
    const unrun = plan
      .filter((j) => !completed.some((c) => c.job.name === j.name))
      .map((j) => j.name);
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
    write("report.json", {
      schema: 1,
      binding,
      config,
      source,
      plannedJobs: plan.length,
      completedJobs: completed.length,
      unrun,
      allowance,
      apiCalls: allowance.calls,
      parentAllowance: original.allowance,
      summary,
      stageSummaries: groups,
      comparisons: comparisonSummary(ordered, rates),
      status:
        "Uniform indexed replacement model; provisional same-model grades, no human calibration. All original grading failures and inherited costs remain separate. Failed grades are not Agent semantic failures.",
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
    writeFileSync(
      path.join(out, "report.md"),
      `# Full evaluation execution\n\n${completed.length}/86 jobs attempted; ${summary.gradedTrials} valid model grades; ${summary.gradingErrors} failed grades; ${unrun.length} unrun.\n\nThe independent Anthropic judge ran out of credits. The replacement judge is DeepSeek, also used by the solver. Original failures and all requests are preserved. These are provisional AI-only scores with correlated-error risk. Invalid grades are explicit failures of grading, not proof that the Agent was wrong.\n\nAll split, paired solver, repeated-run, latency and token results are in report.json. Historical inherited usage is not new spending. This final phase accounts $${allowance.accountedUsd.toFixed(4)} / $${allowance.limitUsd}.\n\nUnrun: ${unrun.join(", ") || "none"}.\n`,
    );
  }
}, 14_400_000);
