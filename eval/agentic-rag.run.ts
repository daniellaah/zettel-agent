import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createProvider } from "../src/agent/providers";
import type { ProviderId } from "../src/agent/providers/catalog";
import { OllamaEmbeddingProvider } from "../src/retrieval/ollama";
import { ExactVectorIndex, MemoryEmbeddingCache } from "../src/retrieval/vector";
import { LocalHybridSearch } from "../src/retrieval/local-search";
import type { SearchPort } from "../src/retrieval/local-search";
import { localOllamaFetch } from "../src/vault/local-http";
import { agenticPlan, agenticReference, type AgenticCase } from "./agentic-plan";
import { runAgentCase } from "./agent-runner";
import { judgeAnswer, scoreAnswer } from "./answer-scoring";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { RecordedProvider } from "./model-recording";
import { pairedBootstrap } from "./paired-bootstrap";
import { reportDestination } from "./report-destination";
import { robustnessTask } from "./robustness";
import { runConfig } from "./run-config";
import { agenticPhase } from "./agentic-plan";
import { sha256, readSnapshot, validateSnapshot } from "./validate";

/** Default preflight has no provider construction, network, embeddings or synthetic quality scores. */
it("prepares or explicitly runs a new paired Agent evaluation", async () => {
  const phase = agenticPhase(process.env);
  const config = phase === "live" ? runConfig({ ...process.env, EVAL_MODE: "live" }) : null;
  const data = loadEvaluationData("expanded");
  const casePath = path.join(import.meta.dirname, "robustness/agentic-rag-v1.json");
  const cases = (JSON.parse(readFileSync(casePath, "utf8")) as { cases: AgenticCase[] }).cases;
  const plan = agenticPlan(data.answers.items, cases, config?.repeats ?? 1);
  if (
    config?.live &&
    config.live.agent.provider === config.live.judge.provider &&
    config.live.agent.model === config.live.judge.model
  )
    throw new Error("The evaluation judge must differ from the answer/self-review model");
  const root = path.resolve(import.meta.dirname, "..");
  const implementationFiles = [
    "src/agent/loop.ts",
    "src/agent/reviewed-turn.ts",
    "src/agent/answer-review.ts",
    "src/agent/context-window.ts",
    "src/agent/tools.ts",
    "src/agent/tool-contract.ts",
    "src/agent/evidence.ts",
    "src/agent/prompt.ts",
    "src/agent/messages.ts",
    "src/agent/provider.ts",
    "src/agent/providers/index.ts",
    "src/agent/providers/anthropic.ts",
    "src/agent/providers/openai-responses.ts",
    "src/agent/providers/chat-completions.ts",
    "src/agent/providers/errors.ts",
    "src/retrieval/local-search.ts",
    "src/retrieval/vector.ts",
    "src/retrieval/ollama.ts",
    "src/retrieval/corpus.ts",
    "src/retrieval/markdown.ts",
    "src/retrieval/lexical-index.ts",
    "src/retrieval/tokenize.ts",
    "src/retrieval/graph.ts",
    "src/vault/local-http.ts",
    "src/settings.ts",
    "eval/model-recording.ts",
    "eval/paired-bootstrap.ts",
    "eval/report-destination.ts",
    "eval/fixture-vault.ts",
    "eval/schema.ts",
    "eval/validate.ts",
    "eval/agentic-plan.ts",
    "eval/agentic-rag.run.ts",
    "eval/agent-runner.ts",
    "eval/answer-scoring.ts",
    "eval/budget-provider.ts",
    "eval/run-config.ts",
    "eval/robustness.ts",
    "package-lock.json",
  ];
  const corpus = loadFixtureCorpus();
  expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
  const binding = {
    implementation: Object.fromEntries(
      implementationFiles.map((file) => [
        file,
        sha256(readFileSync(path.join(root, file), "utf8")),
      ]),
    ),
    corpusHash: data.manifest.corpusHash,
    observedCorpusHash: sha256(
      JSON.stringify(corpus.paths().map((p) => [p, corpus.get(p)!.contentHash])),
    ),
    answersHash: sha256(readFileSync(data.files.answers, "utf8")),
    robustnessHash: sha256(readFileSync(casePath, "utf8")),
    planHash: sha256(JSON.stringify(plan)),
  };
  const out = reportDestination(
    import.meta.dirname,
    process.env.AGENTIC_OUTPUT_DIR ??
      path.join(
        import.meta.dirname,
        "artifacts",
        `agentic-rag-v1-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      ),
  );
  if (existsSync(out)) throw new Error("Use a fresh AGENTIC_OUTPUT_DIR; prior runs are immutable");
  mkdirSync(out, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + "\n");
  const allowance: SpendingAllowance = {
    limitUsd: config?.live?.maxUsd ?? 0,
    maxCalls: config?.live?.maxCalls ?? 0,
    accountedUsd: 0,
    calls: 0,
  };
  write("protocol.json", {
    version: "agentic-rag-v1",
    phase,
    binding,
    plan,
    config,
    allowance,
    qualityStatus: "not-run",
    humanReview: "pending",
    limitations:
      "Previously-used pilot test is regression material, not fresh heldout. New robustness is synthetic and has no human labels. Same-model self-review is not an independent judge. Bootstrap estimates are descriptive until independent human calibration.",
    metrics: [
      "claimSupportRate",
      "citationPrecision",
      "citationCoverage",
      "keyPointCoverage",
      "forbiddenViolations",
      "stop",
      "elapsedMs",
      "usage",
      "repairCount",
    ],
  });
  if (phase === "prepare") {
    console.log(`Preflight: ${plan.length} jobs; zero API/embedding calls; output ${out}`);
    expect(allowance.calls).toBe(0);
    return;
  }
  const live = config!.live!;
  const key = (id: ProviderId) => {
    const value = process.env[`${id.toUpperCase()}_API_KEY`];
    if (!value) throw new Error(`Missing ${id.toUpperCase()}_API_KEY`);
    return value;
  };
  const agentKey = key(live.agent.provider),
    judgeKey = key(live.judge.provider);
  const embedding = await OllamaEmbeddingProvider.connect(
    "http://127.0.0.1:11434",
    localOllamaFetch,
  );
  const cache = new MemoryEmbeddingCache();
  const results: {
    name: string;
    id: string;
    group: string;
    family: string;
    trial: number;
    variant: string;
    scores: ReturnType<typeof scoreAnswer> | null;
    failure: string | null;
  }[] = [];
  for (const job of plan) {
    const robust = cases.find((c) => c.id === job.id);
    const task = robust
      ? robustnessTask(robust)
      : {
          corpus: loadFixtureCorpus(),
          item: data.answers.items.find((item) => item.id === job.id)!,
        };
    let search: SearchPort | undefined;
    const prepareIndex = async () => {
      const index = new ExactVectorIndex(embedding.config);
      const build = await index.rebuild(task.corpus, embedding, cache);
      write(`${job.name}-index.json`, {
        ...build,
        config: embedding.config,
        revision: task.corpus.revision,
      });
      const reader = new LocalHybridSearch(index, embedding, (signal) =>
        embedding.assertIdentity(signal),
      );
      search = reader.search.bind(reader);
    };
    if (job.variant.retrieval === "hybrid") await prepareIndex();
    const agent = new RecordedProvider(
      new BudgetProvider(
        createProvider(live.agent.provider, agentKey, live.agent.model),
        live.agent.rates,
        allowance,
      ),
    );
    const judge = new RecordedProvider(
      new BudgetProvider(
        createProvider(live.judge.provider, judgeKey, live.judge.model),
        live.judge.rates,
        allowance,
      ),
    );
    let scores: ReturnType<typeof scoreAnswer> | null = null;
    let failure: string | null = null;
    try {
      // The hook changes only the synthetic in-memory corpus, never a fixture/vault file.
      const run = await runAgentCase({
        item: task.item,
        corpus: task.corpus,
        provider: agent,
        mode: "live",
        trial: job.trial,
        reviewMode: job.variant.review,
        ...(search && {
          search: (corpus, query, options, signal) => search!(corpus, query, options, signal),
        }),
        beforeTurn: (corpus, index) => {
          if (robust?.updateBeforeFinal && index === task.item.history.length)
            for (const note of robust.updateBeforeFinal)
              corpus.upsert(note.path, `# Current policy\n\n${note.body}`);
        },
        signal: AbortSignal.timeout(600_000),
      });
      write(`${job.name}-run.json`, run);
      // If a synthetic source changes mid-turn, production deliberately uses explicit lexical fallback
      // until the host rebuilds. This variant captures that stale-index behavior rather than rebuilding from the agent.
      const graded = await judgeAnswer(
        agenticReference(task.item, robust?.updateBeforeFinal),
        run,
        judge,
        AbortSignal.timeout(180_000),
      );
      write(`${job.name}-judgment.json`, graded);
      scores = scoreAnswer(graded.judgment);
      write(`${job.name}-human-review.json`, {
        status: "pending",
        runHash: sha256(JSON.stringify(run)),
        judgmentHash: sha256(JSON.stringify(graded.judgment)),
        labels: null,
        omittedClaims: [],
        instructions:
          "Independently check every factual answer unit, actual delivered evidence and unanswered/conflicting question parts before opening judge verdicts.",
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : "Evaluation failed";
    }
    write(`${job.name}-recording.json`, {
      binding,
      agent: agent.exchanges,
      judge: judge.exchanges,
      failure,
    });
    results.push({
      name: job.name,
      id: job.id,
      group: job.group,
      family: task.item.family,
      trial: job.trial,
      variant: job.variant.id,
      scores,
      failure,
    });
    write("checkpoint.json", {
      binding,
      allowance,
      results,
      qualityStatus: "uncalibrated-model-judge; human-review-pending",
    });
  }
  const comparisons = [
    { baseline: "bm25", variant: "hybrid" },
    { baseline: "bm25", variant: "hybrid-review" },
    { baseline: "hybrid", variant: "hybrid-review" },
  ].map(({ baseline, variant }) => ({
    baseline,
    variant,
    metrics: Object.fromEntries(
      (
        ["claimSupportRate", "citationPrecision", "citationCoverage", "keyPointCoverage"] as const
      ).map((metric) => [
        metric,
        pairedBootstrap(
          results
            .filter((r) => r.variant === baseline)
            .map((base) => ({
              group: base.family,
              lexical: base.scores?.[metric] ?? null,
              hybrid:
                results.find(
                  (r) => r.id === base.id && r.trial === base.trial && r.variant === variant,
                )?.scores?.[metric] ?? null,
            })),
        ),
      ]),
    ),
  }));
  write("summary.json", {
    binding,
    allowance,
    results,
    comparisons,
    failures: results.filter((r) => r.failure).length,
    humanReview: "pending",
    qualityStatus: "descriptive; do not promote defaults without calibration and fresh heldout",
  });
}, 7_200_000);
