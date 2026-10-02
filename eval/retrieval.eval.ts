import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";

import type { TokenizerMode } from "../src/retrieval/tokenize";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { meanMeasured, scoreRetrieval } from "./metrics";
import { readSnapshot, sha256, validateSets, validateSnapshot } from "./validate";

const MODES: TokenizerMode[] = ["words", "bigrams", "both"];
const ROOT = path.resolve(import.meta.dirname, "..");

describe("frozen learning corpus retrieval pilot", () => {
  it("validates fixtures and reports graded retrieval without model calls", async () => {
    const { manifest, retrieval, answers, files } = loadEvaluationData();
    const corpus = loadFixtureCorpus();
    expect(validateSnapshot(manifest, readSnapshot(corpus))).toEqual([]);
    expect(validateSets(manifest, retrieval, answers, corpus)).toEqual([]);
    expect(
      sha256(readFileSync(path.join(ROOT, "fixtures/technical-note-audit.json"), "utf8")),
    ).toBe(manifest.sourceAuditSha256);

    const runs = MODES.map((mode) => {
      const index = loadFixtureCorpus(mode);
      const queries = retrieval.items.map((item) => {
        const hits = index.search(item.query, { limit: 20 });
        const grades = Object.fromEntries(
          Object.entries(item.judgments).map(([file, judgment]) => [file, judgment.grade]),
        );
        return {
          id: item.id,
          kind: item.kind,
          split: item.split,
          query: item.query,
          answerability: item.answerability,
          relevantCount: Object.values(grades).filter((grade) => grade > 0).length,
          scores: scoreRetrieval(
            hits.slice(0, 10).map((hit) => hit.path),
            grades,
          ),
          missed10: Object.entries(grades)
            .filter(
              ([file, grade]) => grade > 0 && !hits.slice(0, 10).some((hit) => hit.path === file),
            )
            .map(([file]) => file),
          ranked: hits.map((hit, i) => ({
            rank: i + 1,
            path: hit.path,
            score: hit.score,
            grade: grades[hit.path] ?? null,
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
        };
      });
      return { mode, groups, queries };
    });

    // Bind the actual implementation and annotations, rather than a potentially dirty Git HEAD.
    const report = {
      schema: 1,
      corpusId: manifest.corpusId,
      corpusHash: manifest.corpusHash,
      node: process.version,
      apiCalls: 0,
      review: retrieval.review,
      status:
        process.env.EVAL_SUITE === "expanded"
          ? "frozen family-separated synthetic evaluation; AI labels, incomplete relevance pools; not agent quality"
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
        candidateDepth: 20,
        metricCutoff: 10,
        files: Object.fromEntries(
          [
            "src/settings.ts",
            "src/retrieval/corpus.ts",
            "src/retrieval/lexical-index.ts",
            "src/retrieval/tokenize.ts",
            "src/retrieval/markdown.ts",
            "src/retrieval/graph.ts",
            "eval/schema.ts",
            "eval/fixture-vault.ts",
            "eval/metrics.ts",
            "eval/validate.ts",
            "eval/retrieval.eval.ts",
            "package-lock.json",
          ].map((file) => [file, sha256(readFileSync(path.join(ROOT, file), "utf8"))]),
        ),
      },
      datasets: Object.fromEntries(
        Object.entries({
          manifest: path.join(import.meta.dirname, "corpus-manifest.json"),
          retrieval: files.retrieval,
          answers: files.answers,
        }).map(([key, file]) => [key, sha256(readFileSync(file, "utf8"))]),
      ),
      noteCount: corpus.size,
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
      runs,
    };
    const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
    const both = runs.find((run) => run.mode === "both")!;
    const lines = [
      "# Retrieval development baseline",
      "",
      `Corpus: ${manifest.corpusId}; ${corpus.size} frozen notes (${report.stages.literature} literature, ${report.stages.permanent} permanent).`,
      "",
      `${retrieval.items.length} English synthetic queries with the declared family-separated splits; ${answers.items.length} answer rubrics validated by this retrieval-only command. Live answer execution is reported separately. ${report.judgedPairs} query-note judgments. Review: ${retrieval.review}.`,
      "",
      "This evaluation measures lexical retrieval only. Expanded test source families were frozen before model runs and isolated from development; labels are AI-authored rather than blind human gold. Expanded relevance labels explicitly cover known sources and supporting thoughts plus unrelated controls; the broader candidate pools remain incompletely judged. Another retriever can surface unjudged relevant notes. API calls: 0.",
      "",
      "Recall counts grades 1 and 2. MRR@10 uses only queries with a grade-2 note. nDCG@10 uses linear graded gain (0, 1, 2). No-answer queries have no positive denominator and are excluded from quality averages; returned matches are shown separately. Unknown candidates have zero gain provisionally and are counted as unjudged.",
      "",
      "| Mode | Group | Items | Recall items | MRR items | R@5 | R@10 | MRR@10 | nDCG@10 | Unjudged top-10 |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...runs.flatMap((run) =>
        run.groups.map(
          (g) =>
            `| ${run.mode} | ${g.group} | ${g.items} | ${g.recallItems} | ${g.mrrItems} | ${pct(g.recall5)} | ${pct(g.recall10)} | ${pct(g.mrr)} | ${pct(g.ndcg10)} | ${g.unjudged10} |`,
        ),
      ),
      "",
      "## Missed supporting notes at ten (both)",
      "",
      ...both.queries
        .filter((query) => query.missed10.length)
        .flatMap((query) => [
          `- **${query.id}** (${pct(query.scores.recall10)}): ${query.query}`,
          ...query.missed10.map((file) => `  - ${file}`),
        ]),
      "",
      "## No-answer candidates (both)",
      "",
      ...both.queries
        .filter((query) => query.answerability === "no-answer")
        .map(
          (query) =>
            `- **${query.id}**: ${query.query} Top matches: ${
              query.ranked
                .slice(0, 3)
                .map((hit) => hit.path.split("/").pop()!.replace(/\.md$/, ""))
                .join("; ") || "none"
            }. These do not establish the requested owner fact.`,
        ),
      "",
      "## Interpretation and next step",
      "",
      "English-only tokenization does not test CJK behavior. Broad supporting-label recall can be low even when a sufficient note ranks first, so inspect Recall, MRR and per-item misses together. No performance threshold is imposed on this first baseline; invalid fixtures fail the run, quality changes are reported.",
      "",
      "Do not tune on the test scores. Answer quality, independently declared robustness cases, solver comparisons and repetitions are measured separately. Unknown labels are reported explicitly and make these retrieval quality estimates provisional.",
      "",
      "Reproduce with `npm run eval`. Machine-readable rankings, configuration hashes and denominators are in `retrieval-baseline.json`. Each run replaces these two reports without modifying the corpus or annotations.",
      "",
    ];
    const reportName =
      process.env.EVAL_SUITE === "expanded" ? "retrieval-expanded" : "retrieval-baseline";
    const out = path.join(import.meta.dirname, "reports");
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, `${reportName}.json`),
      await format(JSON.stringify(report), { parser: "json", printWidth: 100 }),
    );
    writeFileSync(
      path.join(out, `${reportName}.md`),
      await format(lines.join("\n"), { parser: "markdown" }),
    );
    console.log(
      lines.slice(0, lines.indexOf("## Missed supporting notes at ten (both)")).join("\n"),
    );
  });
});
