import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { createProvider } from "../src/agent/providers/index";
import type { ProviderId } from "../src/agent/providers/catalog";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { runAgentCase } from "./agent-runner";
import { JudgeOutputError, judgeAnswer, scoreAnswer, type Judgment } from "./answer-scoring";
import { sumUsage, summarizeAgentRuns, type GradedRun } from "./agent-report";
import { runBaselineCase } from "./baselines";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { comparisonSummary, fullPlan, type CompletedJob } from "./full-plan";
import { judgeIndexed } from "./indexed-scoring";
import { RecordedProvider, StrictReplayProvider, type ModelExchange } from "./model-recording";
import { robustnessInterfaceChecks, robustnessTask, type RobustCase } from "./robustness";
import { runConfig } from "./run-config";
import { smokeAgent, smokeIndexedJudgment, smokeJudgment } from "./smoke";
import { readSnapshot, sha256, validateSets, validateSnapshot } from "./validate";

it("runs the predeclared expanded suite, paired comparisons, repeats and independent attacks", async () => {
  const config = runConfig(process.env);
  if (config.ids.length || config.repeats !== 1)
    throw new Error("Full runner uses its frozen plan, not EVAL_IDS/EVAL_REPEATS");
  const data = loadEvaluationData("expanded");
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  expect(validateSets(data.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
  const robustPath = path.join(import.meta.dirname, "robustness/cases.json");
  const robustness = (JSON.parse(readFileSync(robustPath, "utf8")) as { cases: RobustCase[] })
    .cases;
  // A harness experiment reruns only development Agent jobs, graded like v1's indexed round.
  const selection = {
    scope: z.enum(["all", "dev-agent"]).parse(process.env.EVAL_FULL_SCOPE ?? "all"),
    judge: z.enum(["legacy", "indexed"]).parse(process.env.EVAL_FULL_JUDGE ?? "legacy"),
  };
  const plan = fullPlan(data.answers.items, robustness).filter(
    (job) => selection.scope === "all" || (job.group === "dev" && job.variant === "agent"),
  );
  const root = path.resolve(import.meta.dirname, "..");
  const freezePath = path.join(import.meta.dirname, "suites/expanded/freeze.json");
  const freeze = JSON.parse(readFileSync(freezePath, "utf8")) as { hashes: Record<string, string> };
  for (const [file, hash] of Object.entries(freeze.hashes))
    expect(sha256(readFileSync(path.join(path.dirname(freezePath), file), "utf8"))).toBe(hash);
  expect(sha256(readFileSync(path.join(root, "fixtures/technical-note-audit.json"), "utf8"))).toBe(
    data.manifest.sourceAuditSha256,
  );
  const runtime = [
    "src/agent/loop.ts",
    "src/agent/context-window.ts",
    "src/agent/citation-check.ts",
    "src/agent/tools/index.ts",
    "src/agent/tools/shared.ts",
    "src/agent/tools/search.ts",
    "src/agent/tools/match.ts",
    "src/agent/tools/read.ts",
    "src/agent/tools/links.ts",
    "src/agent/tools/list.ts",
    "src/agent/tool-contract.ts",
    "src/agent/prompt.ts",
    "src/agent/evidence.ts",
    "src/agent/messages.ts",
    "src/agent/providers/index.ts",
    "src/agent/providers/errors.ts",
    "src/agent/providers/anthropic.ts",
    "src/agent/providers/chat-completions.ts",
    "src/agent/providers/openai-responses.ts",
    "src/retrieval/corpus.ts",
    "src/retrieval/markdown.ts",
    "src/retrieval/lexical-index.ts",
    "src/retrieval/graph.ts",
    "src/retrieval/tokenize.ts",
    "src/settings.ts",
    "eval/agent-runner.ts",
    "eval/answer-scoring.ts",
    "eval/indexed-scoring.ts",
    "eval/baselines.ts",
    "eval/robustness.ts",
    "eval/full-plan.ts",
    "eval/full.run.ts",
    "eval/budget-provider.ts",
    "eval/model-recording.ts",
    "eval/agent-report.ts",
    "eval/run-config.ts",
    "package-lock.json",
  ];
  const binding = {
    corpusHash: data.manifest.corpusHash,
    sourceAuditSha256: data.manifest.sourceAuditSha256,
    answersSha256: sha256(readFileSync(data.files.answers, "utf8")),
    retrievalSha256: sha256(readFileSync(data.files.retrieval, "utf8")),
    freezeSha256: sha256(readFileSync(freezePath, "utf8")),
    robustnessSha256: sha256(readFileSync(robustPath, "utf8")),
    selection,
    implementation: Object.fromEntries(
      runtime.map((file) => [file, sha256(readFileSync(path.join(root, file), "utf8"))]),
    ),
  };
  const out =
    process.env.EVAL_FULL_RESUME_DIR ??
    path.join(
      import.meta.dirname,
      "artifacts",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-full-${config.mode}`,
    );
  mkdirSync(out, { recursive: true });
  const prior = existsSync(path.join(out, "report.json"))
    ? (JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as {
        binding: unknown;
        allowance: SpendingAllowance;
        config: typeof config;
      })
    : null;
  if (
    prior &&
    (JSON.stringify(prior.binding) !== JSON.stringify(binding) ||
      JSON.stringify(prior.config) !== JSON.stringify(config))
  )
    throw new Error(
      "Resume implementation, annotations or config changed; never mix runs silently",
    );
  const allowance: SpendingAllowance = prior?.allowance ?? {
    limitUsd: config.live?.maxUsd ?? 0,
    accountedUsd: 0,
    calls: 0,
    maxCalls: config.live?.maxCalls ?? 0,
  };
  const completed: CompletedJob[] = [];
  let halt = false;
  const write = (file: string, value: unknown) =>
    writeFileSync(path.join(out, file), `${JSON.stringify(value, null, 2)}\n`);
  const rates = {
    agent: config.live?.agent.rates ?? null,
    judge: config.live?.judge.rates ?? null,
  };
  for (const job of plan)
    if (existsSync(path.join(out, `${job.name}-result.json`))) {
      const stored = JSON.parse(
        readFileSync(path.join(out, `${job.name}-result.json`), "utf8"),
      ) as { binding: unknown; record: GradedRun };
      if (JSON.stringify(stored.binding) !== JSON.stringify(binding))
        throw new Error("Completed job binding changed");
      completed.push({ job, record: stored.record });
    }
  write("plan.json", {
    schema: 1,
    binding,
    jobs: plan.map((job) => ({
      name: job.name,
      item: job.item,
      variant: job.variant,
      trial: job.trial,
      group: job.group,
      independentRobustness: !!job.robust,
    })),
    policy:
      "Two workers per phase; development and all comparisons first, independent attacks next, held-out tests last. Freeze and implementation are bound before any score.",
  });
  report();
  for (const group of ["dev", "robustness", "test"] as const) {
    const pending = plan.filter(
      (j) => j.group === group && !completed.some((c) => c.job.name === j.name),
    );
    let next = 0;
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (!halt && next < pending.length) {
          const job = pending[next++]!;
          const taskCorpus = job.robust ? robustnessTask(job.robust).corpus : corpus;
          const recorded =
            config.mode === "replay"
              ? (JSON.parse(
                  readFileSync(path.join(config.replayDir!, `${job.name}-recording.json`), "utf8"),
                ) as {
                  binding: unknown;
                  provider: string;
                  model: string;
                  judgeProvider: string;
                  judgeModel: string;
                  agent: ModelExchange[];
                  judge: ModelExchange[];
                })
              : null;
          if (recorded && JSON.stringify(recorded.binding) !== JSON.stringify(binding))
            throw new Error("Replay binding changed");
          const make = (role: "agent" | "judge", answer = "") => {
            const model = config.live?.[role];
            if (model)
              return new RecordedProvider(
                new BudgetProvider(
                  createProvider(model.provider, apiKey(model.provider), model.model),
                  model.rates,
                  allowance,
                ),
              );
            if (recorded)
              return new RecordedProvider(
                new StrictReplayProvider(
                  role === "agent" ? recorded.provider : recorded.judgeProvider,
                  role === "agent" ? recorded.model : recorded.judgeModel,
                  recorded[role],
                ),
              );
            return new RecordedProvider(
              role === "judge"
                ? new ScriptedProvider([
                    [
                      text(
                        JSON.stringify(
                          selection.judge === "indexed"
                            ? smokeIndexedJudgment(job.item, answer)
                            : smokeJudgment(job.item),
                        ),
                      ),
                    ],
                  ])
                : job.variant === "agent"
                  ? smokeAgent(job.item)
                  : new ScriptedProvider(
                      [...job.item.history, job.item.question].map(() => [
                        text("Smoke run completed. No model quality is measured."),
                      ]),
                    ),
            );
          };
          const agent = make("agent");
          const options = {
            item: job.item,
            corpus: taskCorpus,
            provider: agent,
            trial: job.trial,
            mode: config.mode === "smoke" ? ("scripted" as const) : config.mode,
            signal: AbortSignal.timeout(300_000),
          };
          const run =
            job.variant === "agent"
              ? await runAgentCase(options)
              : await runBaselineCase({ ...options, variant: job.variant });
          write(`${job.name}-run.json`, run);
          const judge = make("judge", run.turns.at(-1)?.result.answer);
          let judgment: Judgment | null = null;
          let gradingError: string | null = null;
          const judgeStart = performance.now();
          try {
            const grade = selection.judge === "indexed" ? judgeIndexed : judgeAnswer;
            const graded = await grade(job.item, run, judge, AbortSignal.timeout(240_000), {
              maxRepairs: 2,
            });
            judgment = graded.judgment;
            write(`${job.name}-judgment.json`, graded);
          } catch (error) {
            gradingError = judge.describeError(error);
            write(`${job.name}-grading-error.json`, {
              error: gradingError,
              attempts: error instanceof JudgeOutputError ? error.attempts : [],
              returnedExchanges: judge.exchanges.length,
            });
          }
          if (
            recorded &&
            (agent.exchanges.length !== recorded.agent.length ||
              judge.exchanges.length !== recorded.judge.length)
          )
            throw new Error("Replay did not consume all requests");
          const record: GradedRun = {
            run,
            agentUsage: sumUsage(agent.exchanges.map((e) => e.response.usage)),
            targetQuestion: job.item.question,
            answerability: job.item.answerability,
            judgment,
            judgeUsage: sumUsage(judge.exchanges.map((e) => e.response.usage)),
            judgeElapsedMs: performance.now() - judgeStart,
            gradingError,
          };
          write(`${job.name}-recording.json`, {
            binding,
            provider: agent.provider,
            model: agent.model,
            judgeProvider: judge.provider,
            judgeModel: judge.model,
            agent: agent.exchanges,
            judge: judge.exchanges,
          });
          write(`${job.name}-result.json`, {
            binding,
            record,
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
            `${job.name}: ${run.turns.at(-1)?.result.stop}; ${judgment ? "graded" : "grading failed"}; ${completed.length}/${plan.length}; reserved/known $${allowance.accountedUsd.toFixed(4)}`,
          );
        }
      }),
    );
    if (halt) break;
  }
  report();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  console.log(`Full evaluation artifacts: ${out}`);
  expect(
    completed.length,
    "Unrun jobs are retained explicitly; never claim completion when the API allowance stops a run",
  ).toBe(plan.length);
  expect(
    completed.filter((c) => c.record.gradingError).map((c) => c.job.name),
    "Failed grades remain visible, rather than becoming successful samples",
  ).toEqual([]);

  function report() {
    const ordered = plan.flatMap((job) => completed.filter((c) => c.job.name === job.name));
    const unrun = plan
      .filter((j) => !completed.some((c) => c.job.name === j.name))
      .map((j) => j.name);
    const summary = summarizeAgentRuns(
      ordered.map((c) => c.record),
      rates.agent,
      rates.judge,
    );
    const stageSummaries = Object.fromEntries(
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
      apiCalls: config.mode === "live" ? allowance.calls : 0,
      allowance,
      plannedJobs: plan.length,
      completedJobs: completed.length,
      unrun,
      status:
        config.mode === "smoke"
          ? "Scripted mechanics only; NOT model quality"
          : "AI-calibrated semantic evaluation; no human or blind calibration; failed grades and incomplete jobs visible",
      summary,
      stageSummaries,
      comparisons: comparisonSummary(ordered, rates),
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
    const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
    writeFileSync(
      path.join(out, "report.md"),
      [
        `# Expanded evaluation`,
        "",
        `Mode: ${config.mode}. ${completed.length}/${plan.length} planned jobs completed; ${summary.gradingErrors} grading errors; ${unrun.length} unrun.`,
        "",
        "Labels and adjudication are AI-only. These are synthetic technical questions, not independent blind human gold. A frozen source-family-separated test set is distinct from development. Retrieval pools are incompletely judged. Passing a rubric is a descriptive strict threshold, not a universal quality guarantee.",
        "",
        "| Group | Trials | Graded | Strict pass | Agent median ms | Agent p95 ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...Object.entries(stageSummaries).map(
          ([group, stats]) =>
            `| ${group} | ${stats.trials} | ${stats.gradedTrials} | ${pct(stats.pilotPassRate)} | ${stats.agentLatencyMs.median?.toFixed(0) ?? "—"} | ${stats.agentLatencyMs.p95?.toFixed(0) ?? "—"} |`,
        ),
        "",
        `Known token-rate estimates: agent $${summary.estimatedAgentUsd?.toFixed(4) ?? "unpriced"}, judge $${summary.estimatedJudgeUsd?.toFixed(4) ?? "unpriced"}. Allowance accounting includes unknown failed-request reservations: $${allowance.accountedUsd.toFixed(4)} / $${allowance.limitUsd.toFixed(2)}. Provider invoices remain authoritative.`,
        "",
        "Six predeclared development items compare the normal agent, deterministic top-five retrieval and no vault with the same model. Six fresh second trials measure first/any/all repeat reliability. Full paired denominators, tokens, cost and latency are in report.json. Small comparison samples support descriptive findings only.",
        "",
        "All failed answers/grades and original recordings are retained. Independent robustness fixtures include injected role instructions, escaped closures, fabricated personal measurements, conflicting notes, fleeting exclusions, graph/body distinction, regex failure recovery and title-only evidence. Interface invariants are checked separately from live semantic outcomes.",
        "",
        `Unrun: ${unrun.join(", ") || "none"}.`,
        "",
      ].join("\n"),
    );
  }
}, 14_400_000);

function apiKey(provider: ProviderId): string {
  const key = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!key) throw new Error(`Missing ${provider.toUpperCase()}_API_KEY`);
  return key;
}
