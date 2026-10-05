import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";

import {
  FUSION_CANDIDATES,
  type CorpusHit,
  type CorpusOptions,
  type CorpusSearchOptions,
} from "../src/retrieval/corpus";
import type { LexicalOptions } from "../src/retrieval/lexical-index";
import { fusionFor } from "../src/retrieval/embedding-models";
import { RRF_K } from "../src/retrieval/fusion";
import { loadEvaluationData, loadFixtureCorpus, pendingNotes } from "./fixture-vault";
import { meanMeasured, scoreJudgedOnly, scoreRetrieval } from "./metrics";
import { pairedBootstrap } from "./paired-bootstrap";
import { reportDestination } from "./report-destination";
import { readSnapshot, sha256, validateSets, validateSnapshot } from "./validate";
import { applyDocumentVectors, loadEvalVectors, queryVector } from "./vectors";

/** Each keyword-search fix alone on top of the v0.1 index, the round-3 set, then all. */
const V01: LexicalOptions = {
  compounds: false,
  queryStopwords: false,
  queryBoilerplate: false,
  wholeNoteIdf: false,
  titleOnce: false,
};
const LEXICAL_VARIANTS: { name: string; options: Pick<CorpusOptions, "lexical" | "phrases"> }[] = [
  { name: "lexical:v0.1", options: { lexical: V01, phrases: false } },
  {
    name: "lexical:+stopwords",
    options: { lexical: { ...V01, queryStopwords: true }, phrases: false },
  },
  {
    name: "lexical:+boilerplate",
    options: { lexical: { ...V01, queryBoilerplate: true }, phrases: false },
  },
  { name: "lexical:+compounds", options: { lexical: { ...V01, compounds: true }, phrases: false } },
  { name: "lexical:+phrases", options: { lexical: V01 } },
  {
    name: "lexical:+note-idf",
    options: { lexical: { ...V01, wholeNoteIdf: true }, phrases: false },
  },
  {
    name: "lexical:+title-once",
    options: { lexical: { ...V01, titleOnce: true }, phrases: false },
  },
  {
    name: "lexical:round3",
    options: { lexical: { queryBoilerplate: false, wholeNoteIdf: false, titleOnce: false } },
  },
  { name: "lexical", options: {} },
];
/** What every other retriever is compared against: the BM25F index shipped in v0.1. */
const BASELINE = "lexical:v0.1";
/** Convex weight per model from the model profiles, tuned by `npm run eval:sweep` on dev. */
const tunedAlpha = (model: string) => {
  const fusion = fusionFor(model);
  return fusion.method === "convex" ? fusion.alpha : 0.5;
};
const ROOT = path.resolve(import.meta.dirname, "..");
const SUITE = process.env.EVAL_SUITE ?? "pilot";

interface Retriever {
  name: string;
  search: (query: string) => CorpusHit[];
}

describe("frozen learning corpus retrieval", () => {
  it("validates fixtures and compares lexical, semantic and hybrid retrieval without model calls", async () => {
    const { manifest, retrieval, answers, files, labels } = loadEvaluationData();
    const pending = pendingNotes();
    const corpus = loadFixtureCorpus();
    expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
    expect(validateSets(manifest, retrieval, answers, corpus)).toEqual([]);
    expect(
      sha256(readFileSync(path.join(ROOT, "fixtures/technical-note-audit.json"), "utf8")),
    ).toBe(manifest.sourceAuditSha256);

    // Semantic retrievers use frozen vectors from `npm run eval:embed`, one set per model.
    const vectorSets = loadEvalVectors();
    const retrievers: Retriever[] = [
      ...LEXICAL_VARIANTS.map(({ name, options }) => {
        const index = loadFixtureCorpus("both", options);
        return {
          name,
          search: (query: string) => index.search(query, { limit: FUSION_CANDIDATES }),
        };
      }),
      ...vectorSets.flatMap((set) => {
        const index = loadFixtureCorpus("both", { semantic: true });
        applyDocumentVectors(index, set);
        const alpha = tunedAlpha(set.model);
        const configs: [string, CorpusSearchOptions][] = [
          ["semantic", { mode: "semantic" }],
          ["hybrid-rrf", { mode: "hybrid", fusion: { method: "rrf", k: RRF_K } }],
          [`hybrid-convex(${alpha})`, { mode: "hybrid", fusion: { method: "convex", alpha } }],
        ];
        return configs.map(([name, options]) => ({
          name: `${name}:${set.model}`,
          search: (query: string) =>
            index.search(query, {
              ...options,
              queryVector: queryVector(set, query),
              limit: FUSION_CANDIDATES,
            }),
        }));
      }),
    ];

    const runs = retrievers.map(({ name, search }) => {
      const queries = retrieval.items.map((item) => {
        const hits = search(item.query);
        const ranked = hits.map((hit) => hit.path);
        const grades = Object.fromEntries(
          Object.entries(item.judgments).map(([file, judgment]) => [file, judgment.grade]),
        );
        const top10 = ranked.slice(0, 10);
        const answer = ranked.findIndex((file) => grades[file] === 2);
        return {
          id: item.id,
          family: item.family,
          kind: item.kind,
          split: item.split,
          query: item.query,
          answerability: item.answerability,
          relevantCount: Object.values(grades).filter((grade) => grade > 0).length,
          scores: scoreRetrieval(top10, grades),
          // A term-occurrence pool is complete: every unjudged note lacks the term.
          judgedOnly:
            "term" in item.pool ? scoreRetrieval(top10, grades) : scoreJudgedOnly(ranked, grades),
          /** Rank of the first sufficient (grade-2) note within the candidate depth. */
          answerRank: answer === -1 ? null : answer + 1,
          missed10: Object.entries(grades)
            .filter(([file, grade]) => grade > 0 && !top10.includes(file))
            .map(([file]) => file),
          unjudged10: top10.filter((file) => grades[file] === undefined),
          ranked: hits.slice(0, 20).map((hit, i) => ({
            rank: i + 1,
            path: hit.path,
            score: hit.score,
            grade: grades[hit.path] ?? null,
            lexicalRank: hit.lexicalRank,
            semanticRank: hit.semanticRank,
          })),
        };
      });
      const groups = [
        "all",
        ...new Set(queries.map((query) => `kind:${query.kind}`)),
        ...new Set(queries.map((query) => `split:${query.split}`)),
      ].map((group) => {
        const rows = queries.filter(
          (query) =>
            group === "all" || group === `kind:${query.kind}` || group === `split:${query.split}`,
        );
        return {
          group,
          items: rows.length,
          recallItems: rows.filter((row) => row.scores.recall10 !== null).length,
          mrrItems: rows.filter((row) => row.scores.mrr !== null).length,
          recall5: meanMeasured(rows.map((row) => row.scores.recall5)),
          recall10: meanMeasured(rows.map((row) => row.scores.recall10)),
          mrr: meanMeasured(rows.map((row) => row.scores.mrr)),
          ndcg10: meanMeasured(rows.map((row) => row.scores.ndcg10)),
          unjudged10: rows.reduce((sum, row) => sum + row.scores.unjudged10, 0),
          judgedMrr: meanMeasured(rows.map((row) => row.judgedOnly.mrr)),
          judgedNdcg10: meanMeasured(rows.map((row) => row.judgedOnly.ndcg10)),
        };
      });
      return { retriever: name, groups, queries };
    });

    // Per-query differences against BM25F, resampled by source family (queries about the
    // same source are not independent).
    const baseline = runs.find((run) => run.retriever === BASELINE)!;
    const comparisons = runs
      .filter((run) => run.retriever !== BASELINE)
      .flatMap((run) =>
        (
          [
            ["mrr", (q: (typeof run.queries)[number]) => q.scores.mrr],
            ["ndcg10", (q: (typeof run.queries)[number]) => q.scores.ndcg10],
            ["judged-only mrr", (q: (typeof run.queries)[number]) => q.judgedOnly.mrr],
            ["judged-only ndcg10", (q: (typeof run.queries)[number]) => q.judgedOnly.ndcg10],
          ] as const
        ).map(([metric, value]) => ({
          retriever: run.retriever,
          metric,
          ...pairedBootstrap(
            run.queries.map((query, i) => ({
              group: query.family,
              baseline: value(baseline.queries[i]!),
              candidate: value(query),
            })),
          ),
        })),
      );

    // Bind the actual implementation and annotations, rather than a potentially dirty Git HEAD.
    const report = {
      schema: 2,
      suite: SUITE,
      corpusId: manifest.corpusId,
      corpusHash: manifest.corpusHash,
      node: process.version,
      apiCalls: 0,
      labels,
      review: retrieval.review,
      status:
        SUITE === "expanded"
          ? "frozen family-separated synthetic evaluation; AI labels, incomplete relevance pools; not agent quality"
          : SUITE === "crosslingual"
            ? "Chinese restatements of the expanded suite (AI-translated); labels inherited; not agent quality"
            : SUITE === "exact" || SUITE === "exact-terms"
              ? "exact-term lookups with complete term-occurrence labels; not agent quality"
              : "development pilot; not a held-out benchmark or agent-quality result",
      implementation: {
        bm25: {
          k1: 1.2,
          b: 0.75,
          title: 10,
          aliases: 8,
          headings: 6,
          tags: 5,
          body: 1,
          links: 0.25,
        },
        fusion: {
          rrf: { k: RRF_K },
          convex: {
            alpha: Object.fromEntries(vectorSets.map((set) => [set.model, tunedAlpha(set.model)])),
            tunedBy: "eval/fusion-sweep.run.ts on the dev split",
          },
          candidatesPerRetriever: FUSION_CANDIDATES,
        },
        embeddings: vectorSets.map((set) => ({
          model: set.model,
          embedder: set.embedder,
          dimensions: set.dimensions,
          sha256: createHash("sha256").update(readFileSync(set.file)).digest("hex"),
        })),
        candidateDepth: FUSION_CANDIDATES,
        metricCutoff: 10,
        files: Object.fromEntries(
          [
            "src/settings.ts",
            "src/retrieval/corpus.ts",
            "src/retrieval/lexical-index.ts",
            "src/retrieval/dense-index.ts",
            "src/retrieval/embedding.ts",
            "src/retrieval/fusion.ts",
            "src/retrieval/tokenize.ts",
            "src/retrieval/markdown.ts",
            "src/retrieval/graph.ts",
            "eval/schema.ts",
            "eval/fixture-vault.ts",
            "eval/metrics.ts",
            "eval/validate.ts",
            "eval/vectors.ts",
            "eval/retrieval.eval.ts",
            "package-lock.json",
          ].map((file) => [file, sha256(readFileSync(path.join(ROOT, file), "utf8"))]),
        ),
      },
      datasets: Object.fromEntries(
        Object.entries({
          manifest: path.join(import.meta.dirname, "corpus-manifest.json"),
          ...files,
        }).map(([key, file]) => [key, sha256(readFileSync(file, "utf8"))]),
      ),
      noteCount: corpus.size,
      pendingNotes: pending,
      stages: {
        literature: manifest.notes.filter((note) => note.stage === "literature").length,
        permanent: manifest.notes.filter((note) => note.stage === "permanent").length,
      },
      retrievalItems: retrieval.items.length,
      answerRubrics: answers.items.length,
      judgedPairs: retrieval.items.reduce(
        (sum, item) => sum + Object.keys(item.judgments).length,
        0,
      ),
      comparisons,
      runs,
    };

    const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
    const signed = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}`;
    const short = (file: string) => file.split("/").pop()!.replace(/\.md$/, "");
    const language =
      SUITE === "crosslingual"
        ? "Chinese"
        : SUITE === "exact"
          ? "English and Chinese"
          : SUITE === "exact-terms"
            ? "term-only"
            : "English";
    const summaryRows = runs.flatMap((run) =>
      run.groups
        .filter((g) => g.group === "all" || g.group.startsWith("split:"))
        .map(
          (g) =>
            `| ${run.retriever} | ${g.group} | ${g.items} | ${pct(g.recall10)} | ${pct(g.mrr)} | ${pct(g.ndcg10)} | ${g.unjudged10} | ${pct(g.judgedMrr)} | ${pct(g.judgedNdcg10)} |`,
        ),
    );
    const semanticRuns = runs.filter((run) => !run.retriever.startsWith("lexical"));
    const improvedLexical = runs.find((run) => run.retriever === "lexical")!;
    const shown = [baseline, improvedLexical, ...semanticRuns];
    // Rank changes are listed for the improved keyword index and each tuned hybrid.
    const explained = [
      improvedLexical,
      ...semanticRuns.filter((run) => run.retriever.startsWith("hybrid-convex")),
    ];
    const rankCell = (query: (typeof baseline.queries)[number]) =>
      query.scores.mrr === null
        ? "n/a"
        : query.answerRank === null
          ? "—"
          : String(query.answerRank);

    const lines = [
      `# Retrieval comparison (${SUITE})`,
      "",
      `Corpus: ${manifest.corpusId}; ${corpus.size} frozen notes (${report.stages.literature} literature, ${report.stages.permanent} permanent).${pending.length ? ` ${pending.length} notes added to the sample vault after the freeze were left out: ${pending.map((file) => path.basename(file, ".md")).join("; ")}.` : ""}`,
      "",
      `${retrieval.items.length} ${language} synthetic queries with the declared family-separated splits; ${report.judgedPairs} query-note judgments. Review: ${retrieval.review}.${SUITE === "crosslingual" ? " Queries are AI translations of the expanded suite; relevance labels are inherited unchanged." : ""}`,
      "",
      `Retrievers: the v0.1 BM25F index, each keyword fix alone (English query stopwords, Chinese query frames, whole compounds, quoted phrases first, whole-note IDF, title scored once), the round-3 set and all fixes together; ${vectorSets.length ? vectorSets.map((set) => `semantic, hybrid-rrf and hybrid-convex (alpha ${tunedAlpha(set.model)}, tuned on dev) with ${set.model} (${set.dimensions} dimensions, frozen vectors)`).join("; ") : "no frozen embeddings found, so no semantic runs"}. Hybrid takes ${FUSION_CANDIDATES} section candidates from each retriever; rrf fuses ranks (k=${RRF_K}), convex adds alpha × BM25 / the query's highest possible BM25 and (1 − alpha) × cosine similarity. API calls: 0.`,
      "",
      SUITE === "exact" || SUITE === "exact-terms"
        ? "Labels are complete: every note containing the looked-up term is grade 2 and every other note is irrelevant, so standard and judged-only metrics agree."
        : `Labels: ${labels === "extended" ? "frozen labels plus an AI-judged pool extension for unjudged notes that any retriever ranked in its top five" : "frozen labels only"}. The original pools came from lexical runs, so a semantic retriever can surface relevant notes that were never judged; standard metrics count unjudged notes as zero, judged-only metrics drop them before the cutoff. Read both, and the unjudged counts, before concluding.`,
      "",
      "Recall counts grades 1 and 2. MRR@10 uses only queries with a grade-2 note. nDCG@10 uses linear graded gain (0, 1, 2). No-answer queries are excluded from quality averages.",
      "",
      "## Summary",
      "",
      "| Retriever | Group | Items | R@10 | MRR@10 | nDCG@10 | Unjudged top-10 | MRR@10 judged-only | nDCG@10 judged-only |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...summaryRows,
      "",
      `## Paired differences against ${BASELINE}`,
      "",
      "Percentage points; 95% interval from a bootstrap that resamples source families.",
      "",
      "| Retriever | Metric | Δ | 95% interval | Queries |",
      "| --- | --- | ---: | --- | ---: |",
      ...comparisons.map(
        (c) =>
          `| ${c.retriever} | ${c.metric} | ${c.delta === null ? "—" : signed(c.delta)} | ${c.ci95 ? `${signed(c.ci95[0]!)} to ${signed(c.ci95[1]!)}` : "—"} | ${c.pairs} |`,
      ),
      "",
      "## By kind",
      "",
      "| Retriever | Group | Items | R@10 | MRR@10 | nDCG@10 | MRR@10 judged-only |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
      ...runs.flatMap((run) =>
        run.groups
          .filter((g) => g.group.startsWith("kind:"))
          .map(
            (g) =>
              `| ${run.retriever} | ${g.group} | ${g.items} | ${pct(g.recall10)} | ${pct(g.mrr)} | ${pct(g.ndcg10)} | ${pct(g.judgedMrr)} |`,
          ),
      ),
      "",
      "## Per query: rank of the first sufficient note",
      "",
      `Rank within ${FUSION_CANDIDATES} candidates; — means not found, n/a means no single note is sufficient.`,
      "",
      `| Query | Split | Kind | ${shown.map((run) => run.retriever).join(" | ")} |`,
      `| --- | --- | --- | ${shown.map(() => "---:").join(" | ")} |`,
      ...baseline.queries.map(
        (query, i) =>
          `| **${query.id}** ${query.query} | ${query.split} | ${query.kind} | ${shown.map((run) => rankCell(run.queries[i]!)).join(" | ")} |`,
      ),
      "",
      ...explained.flatMap((run) => {
        const changed = run.queries
          .map((query, i) => ({ query, base: baseline.queries[i]! }))
          .filter(
            ({ query, base }) => query.scores.mrr !== null && query.answerRank !== base.answerRank,
          )
          .sort(
            (a, b) =>
              (a.query.answerRank ?? 999) -
              (a.base.answerRank ?? 999) -
              ((b.query.answerRank ?? 999) - (b.base.answerRank ?? 999)),
          );
        return [
          `## Where ${run.retriever} changed the answer rank`,
          "",
          `${changed.filter(({ query, base }) => (query.answerRank ?? 999) < (base.answerRank ?? 999)).length} improved, ${changed.filter(({ query, base }) => (query.answerRank ?? 999) > (base.answerRank ?? 999)).length} worse. Top three results show [lexical rank / semantic rank] of each hit.`,
          "",
          ...changed.map(({ query, base }) => {
            const top = query.ranked
              .slice(0, 3)
              .map(
                (hit) =>
                  `${short(hit.path)} (${hit.grade ?? "?"}) [${hit.lexicalRank ?? "–"}/${hit.semanticRank ?? "–"}]`,
              )
              .join("; ");
            return `- **${query.id}** ${base.answerRank ?? "—"} → ${query.answerRank ?? "—"}: ${query.query}\n  - top 3: ${top}`;
          }),
          "",
        ];
      }),
      ...semanticRuns.flatMap((run) => [
        `## Unjudged notes in the ${run.retriever} top 10`,
        "",
        "Candidates for labeling: each could be relevant and is currently scored as zero.",
        "",
        ...run.queries
          .filter((query) => query.unjudged10.length)
          .map(
            (query) =>
              `- **${query.id}** (${query.unjudged10.length}): ${query.unjudged10.slice(0, 5).map(short).join("; ")}${query.unjudged10.length > 5 ? "; …" : ""}`,
          ),
        "",
      ]),
      `## Missed supporting notes at ten (${BASELINE})`,
      "",
      ...baseline.queries
        .filter((query) => query.missed10.length)
        .flatMap((query) => [
          `- **${query.id}** (${pct(query.scores.recall10)}): ${query.query}`,
          ...query.missed10.map((file) => `  - ${file}`),
        ]),
      "",
      "## No-answer candidates",
      "",
      "Lexical search can return nothing; semantic search always returns its nearest notes.",
      "",
      ...shown.flatMap((run) => [
        `### ${run.retriever}`,
        "",
        ...run.queries
          .filter((query) => query.answerability === "no-answer")
          .map(
            (query) =>
              `- **${query.id}**: ${query.query} Top matches: ${
                query.ranked
                  .slice(0, 3)
                  .map((hit) => short(hit.path))
                  .join("; ") || "none"
              }.`,
          ),
        "",
      ]),
      "## Interpretation",
      "",
      "Do not tune on the test split. Labels are AI-authored and pools incomplete, so these retrieval estimates are provisional; answer quality is measured separately.",
      "",
      "Reproduce with `npm run eval` (English), `npm run eval:crosslingual` (Chinese) `npm run eval:exact` (exact terms as questions) or `npm run eval:exact-terms` (the terms alone). Regenerate frozen vectors with `npm run eval:embed`. Machine-readable rankings, configuration hashes and denominators are in the JSON report next to this file.",
      "",
    ];
    const reportName = SUITE === "pilot" ? "retrieval-baseline" : `retrieval-${SUITE}`;
    const reportFile = labels === "frozen" ? `${reportName}-frozen-labels` : reportName;
    const out = reportDestination(import.meta.dirname, process.env.EVAL_REPORT_DIR);
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, `${reportFile}.json`),
      await format(JSON.stringify(report), { parser: "json", printWidth: 100 }),
    );
    writeFileSync(
      path.join(out, `${reportFile}.md`),
      await format(lines.join("\n"), { parser: "markdown" }),
    );
    console.log(lines.slice(0, lines.indexOf("## By kind")).join("\n"));
  }, 300_000);
});
