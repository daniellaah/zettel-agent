import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

import { createProvider } from "../src/agent/providers";
import type { QueryVectors } from "../src/retrieval/semantic-indexer";
import { fusionFor } from "../src/retrieval/embedding-models";
import { OllamaEmbedder } from "../src/retrieval/ollama";
import { textLanguage } from "../src/retrieval/tokenize";
import { runAgentCase, type AgentRun } from "./agent-runner";
import { tokenCost, type TokenRates } from "./answer-scoring";
import { BudgetProvider, type SpendingAllowance } from "./budget-provider";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { reportDestination } from "./report-destination";
import { applyDocumentVectors, loadEvalVectors } from "./vectors";

/**
 * A quick, paid check of the agent on Chinese questions about English notes: the plugin
 * before hybrid search (keywords) against after (hybrid with bge-m3), with every search,
 * top hit and citation printed. Run with AGENT_SMOKE=1 npm run eval:agent-smoke.
 */

/** DeepSeek V4.1 Flash peak-hour list prices, USD per million tokens (checked 2026-10-04). */
const RATES: TokenRates = { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0.3 };
const MODEL = process.env.AGENT_SMOKE_MODEL ?? "deepseek-flash";
const EMBEDDING_MODEL = "bge-m3";
/** Cross-lingual dev questions from ten different source families. */
const IDS = ["r06", "r08", "r14", "r021", "r026", "r031", "r046", "r075", "r107", "r113"];

interface ArmResult {
  arm: string;
  searches: { query: string; mode: unknown; top: string[] }[];
  searchedInNotesLanguage: boolean;
  goldSeen: boolean;
  goldCited: boolean;
  cited: string[];
  answer: string;
  stop: string;
  requests: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  seconds: number;
}

const title = (file: string) => path.basename(file, ".md");

function summarize(arm: string, run: AgentRun, gold: string[]): ArmResult {
  const turn = run.turns[0]!;
  const searches = turn.calls
    .filter((call) => call.name === "search")
    .map((call) => ({
      query: (call.input as { query?: string }).query ?? "",
      mode: call.outcome?.contract?.effective.mode,
      top: [...new Set(call.exposures.map((e) => e.path))].slice(0, 3).map(title),
    }));
  const seen = new Set(turn.calls.flatMap((call) => call.exposures.map((e) => e.path)));
  const byId = new Map(run.evidence.map((evidence) => [evidence.id, evidence.path]));
  const cited = [...new Set(turn.result.citations.valid.map((id) => byId.get(id)!))];
  const usage = turn.result.usage;
  return {
    arm,
    searches,
    searchedInNotesLanguage: searches.some((search) => textLanguage(search.query) === "en"),
    goldSeen: gold.some((file) => seen.has(file)),
    goldCited: gold.some((file) => cited.includes(file)),
    cited: cited.map(title),
    answer: turn.result.answer,
    stop: turn.result.stop,
    requests: usage.requests,
    toolCalls: usage.toolCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    usd: tokenCost(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      },
      RATES,
    )!,
    seconds: turn.elapsedMs / 1000,
  };
}

it("answers ten Chinese questions about English notes, with keyword and hybrid search", async () => {
  if (process.env.AGENT_SMOKE !== "1")
    throw new Error("This calls a paid API. Set AGENT_SMOKE=1 to run it.");
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is missing (.env.eval.local).");
  const allowance: SpendingAllowance = {
    limitUsd: Number(process.env.AGENT_SMOKE_MAX_USD ?? 3),
    accountedUsd: 0,
    calls: 0,
    maxCalls: 250,
  };
  const provider = new BudgetProvider(createProvider("deepseek", key, MODEL), RATES, allowance);
  const items = loadEvaluationData("crosslingual").retrieval.items.filter((item) =>
    IDS.includes(item.id),
  );

  // Hybrid: frozen note vectors plus live query vectors for whatever the agent searches.
  const vectors = loadEvalVectors().find((set) => set.model === EMBEDDING_MODEL);
  if (!vectors) throw new Error(`No frozen ${EMBEDDING_MODEL} vectors; run npm run eval:embed.`);
  const embedder = await OllamaEmbedder.connect({ model: EMBEDDING_MODEL });
  const fusion = fusionFor(EMBEDDING_MODEL);
  const queryVectors = async (queries: string[]): Promise<QueryVectors> => {
    const embedded = await embedder.embed(queries, "query");
    return { fusion, vectors: new Map(queries.map((query, i) => [query, embedded[i]!])) };
  };
  const arms = [
    { name: "keywords", corpus: () => loadFixtureCorpus() },
    {
      name: "hybrid",
      corpus: () => {
        const corpus = loadFixtureCorpus("both", { semantic: true });
        applyDocumentVectors(corpus, vectors);
        return corpus;
      },
      queryVectors,
    },
  ];

  const results: { id: string; question: string; gold: string[]; arms: ArmResult[] }[] = [];
  for (const item of items) {
    const gold = Object.entries(item.judgments)
      .filter(([, judgment]) => judgment.grade === 2)
      .map(([file]) => file);
    const row = { id: item.id, question: item.query, gold, arms: [] as ArmResult[] };
    for (const arm of arms) {
      const run = await runAgentCase({
        item: { id: item.id, question: item.query, history: [], activeNote: null },
        corpus: arm.corpus(),
        provider,
        trial: 1,
        mode: "live",
        ...(arm.queryVectors && { queryVectors: arm.queryVectors }),
      });
      row.arms.push(summarize(arm.name, run, gold));
    }
    results.push(row);
    const [a, b] = row.arms;
    console.log(
      `${item.id}: keywords seen=${a!.goldSeen} cited=${a!.goldCited} | hybrid seen=${b!.goldSeen} cited=${b!.goldCited} | spent $${allowance.accountedUsd.toFixed(3)}`,
    );
  }

  const pct = (n: number) => `${n}/${results.length}`;
  const totals = arms.map(({ name }) => {
    const rows = results.map((row) => row.arms.find((arm) => arm.arm === name)!);
    const mean = (f: (r: ArmResult) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    return {
      name,
      seen: rows.filter((r) => r.goldSeen).length,
      cited: rows.filter((r) => r.goldCited).length,
      english: rows.filter((r) => r.searchedInNotesLanguage).length,
      searches: mean((r) => r.searches.length),
      requests: mean((r) => r.requests),
      inputTokens: mean((r) => r.inputTokens),
      usd: rows.reduce((s, r) => s + r.usd, 0),
      seconds: mean((r) => r.seconds),
    };
  });
  const lines = [
    `# Agent smoke test: Chinese questions, keywords vs hybrid (${new Date().toISOString()})`,
    "",
    `Model ${MODEL}; embeddings ${EMBEDDING_MODEL}; ${results.length} cross-lingual dev questions; spending guard $${allowance.limitUsd}, used ≤ $${allowance.accountedUsd.toFixed(3)} by the guard's conservative accounting.`,
    "",
    "| Arm | Gold note seen | Gold note cited | Searched in English | Searches / question | Requests / question | Input tokens / question | Cost (USD) | Seconds / question |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...totals.map(
      (t) =>
        `| ${t.name} | ${pct(t.seen)} | ${pct(t.cited)} | ${pct(t.english)} | ${t.searches.toFixed(1)} | ${t.requests.toFixed(1)} | ${Math.round(t.inputTokens)} | ${t.usd.toFixed(3)} | ${t.seconds.toFixed(1)} |`,
    ),
    "",
    ...results.flatMap((row) => [
      `## ${row.id}: ${row.question}`,
      "",
      `Gold: ${row.gold.map(title).join("; ")}`,
      "",
      ...row.arms.flatMap((arm) => [
        `### ${arm.arm}: seen ${arm.goldSeen ? "yes" : "no"}, cited ${arm.goldCited ? "yes" : "no"} (${arm.stop}, ${arm.requests} requests, ${arm.toolCalls} tool calls, $${arm.usd.toFixed(4)}, ${arm.seconds.toFixed(1)} s)`,
        "",
        ...arm.searches.map(
          (search) =>
            `- search [${String(search.mode)}] "${search.query}" → ${search.top.join("; ") || "nothing"}`,
        ),
        `- cited: ${arm.cited.join("; ") || "none"}`,
        "",
        `> ${arm.answer.replace(/\s+/g, " ").slice(0, 400)}${arm.answer.length > 400 ? "…" : ""}`,
        "",
      ]),
    ]),
  ];
  const out = reportDestination(
    import.meta.dirname,
    process.env.EVAL_REPORT_DIR ?? path.join(import.meta.dirname, "reports/agent-smoke"),
  );
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(out, `${stamp}.md`), lines.join("\n"));
  writeFileSync(path.join(out, `${stamp}.json`), JSON.stringify({ totals, results }, null, 2));
  console.log(lines.slice(0, lines.indexOf("") + 8).join("\n"));
}, 3_600_000);
