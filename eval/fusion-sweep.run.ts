import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { it } from "vitest";

import type { CorpusHit, Fusion } from "../src/retrieval/corpus";
import { RRF_K } from "../src/retrieval/fusion";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { meanMeasured, scoreRetrieval } from "./metrics";
import { reportDestination } from "./report-destination";
import { applyDocumentVectors, loadEvalVectors, queryVector } from "./vectors";

/** One suite per kind of query; each counts equally in the choice. */
const SUITES = ["expanded", "crosslingual", "exact", "exact-terms"] as const;
const ALPHAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

// Tuning reads the dev split only: test items are never scored here.
it("sweeps hybrid fusion on the dev split", async () => {
  const suites = SUITES.map((suite) => ({
    suite,
    items: loadEvaluationData(suite).retrieval.items.filter(
      (item) => item.split === "dev" && item.answerability === "answerable",
    ),
  }));
  const mrr = (search: (query: string) => CorpusHit[]) =>
    suites.map(
      ({ items }) =>
        meanMeasured(
          items.map((item) => {
            const grades = Object.fromEntries(
              Object.entries(item.judgments).map(([file, j]) => [file, j.grade]),
            );
            return scoreRetrieval(
              search(item.query)
                .slice(0, 10)
                .map((hit) => hit.path),
              grades,
            ).mrr;
          }),
        ) ?? 0,
    );

  const rows: { model: string; config: string; mrr: number[]; macro: number; min: number }[] = [];
  const add = (model: string, config: string, values: number[]) =>
    rows.push({
      model,
      config,
      mrr: values,
      macro: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
    });

  const v01 = loadFixtureCorpus("both", {
    lexical: {
      compounds: false,
      queryStopwords: false,
      queryBoilerplate: false,
      wholeNoteIdf: false,
      titleOnce: false,
    },
    phrases: false,
  });
  add(
    "—",
    "lexical v0.1",
    mrr((query) => v01.search(query, { limit: 10 })),
  );
  const lexical = loadFixtureCorpus();
  add(
    "—",
    "lexical",
    mrr((query) => lexical.search(query, { limit: 10 })),
  );

  for (const set of loadEvalVectors()) {
    const corpus = loadFixtureCorpus("both", { semantic: true });
    applyDocumentVectors(corpus, set);
    const hybrid = (fusion: Fusion) => (query: string) =>
      corpus.search(query, { mode: "hybrid", queryVector: queryVector(set, query), fusion });
    add(
      set.model,
      "semantic",
      mrr((query) =>
        corpus.search(query, { mode: "semantic", queryVector: queryVector(set, query) }),
      ),
    );
    add(set.model, `rrf k=${RRF_K}`, mrr(hybrid({ method: "rrf", k: RRF_K })));
    for (const alpha of ALPHAS)
      add(set.model, `convex α=${alpha}`, mrr(hybrid({ method: "convex", alpha })));
  }

  // Pre-declared rule: highest macro-average dev MRR@10, ties broken by the weakest suite.
  const best = Object.fromEntries(
    [...new Set(rows.map((row) => row.model))]
      .filter((model) => model !== "—")
      .map((model) => [
        model,
        rows
          .filter((row) => row.model === model && row.config.startsWith("convex"))
          .sort((a, b) => b.macro - a.macro || b.min - a.min)[0]!.config,
      ]),
  );
  const pct = (value: number) => (value * 100).toFixed(1);
  const lines = [
    "# Hybrid fusion sweep (dev split only)",
    "",
    `MRR@10 on the dev split of each suite (${suites.map((s) => `${s.suite}: ${s.items.length}`).join(", ")} answerable queries). Macro is the unweighted mean over the four suites; min is the weakest suite. Convex fusion scores alpha × BM25 / the query's highest possible BM25 + (1 − alpha) × cosine similarity; RRF uses ranks only.`,
    "",
    "Selection rule, fixed before the sweep: the convex setting with the highest macro MRR@10, ties broken by the higher minimum. Test items are not scored.",
    "",
    `| Model | Fusion | ${SUITES.join(" | ")} | Macro | Min |`,
    `| --- | --- | ${SUITES.map(() => "---:").join(" | ")} | ---: | ---: |`,
    ...rows.map(
      (row) =>
        `| ${row.model} | ${best[row.model] === row.config ? `**${row.config}**` : row.config} | ${row.mrr.map(pct).join(" | ")} | ${pct(row.macro)} | ${pct(row.min)} |`,
    ),
    "",
    ...Object.entries(best).map(([model, config]) => `Selected for ${model}: ${config}.`),
    "",
  ];
  const out = reportDestination(import.meta.dirname, process.env.EVAL_REPORT_DIR);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "fusion-sweep.json"),
    await format(JSON.stringify({ suites: SUITES, alphas: ALPHAS, rows, best }), {
      parser: "json",
      printWidth: 100,
    }),
  );
  writeFileSync(
    path.join(out, "fusion-sweep.md"),
    await format(lines.join("\n"), { parser: "markdown" }),
  );
  console.log(lines.join("\n"));
}, 600_000);
