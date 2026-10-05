import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { it } from "vitest";

import type { CorpusHit, CorpusSearchOptions } from "../src/retrieval/corpus";
import { fusionFor } from "../src/retrieval/embedding-models";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { meanMeasured, scoreRetrieval } from "./metrics";
import { pairedBootstrap } from "./paired-bootstrap";
import { reportDestination } from "./report-destination";
import { loadRewrites, REWRITE_SOURCES, type RewriteSource } from "./rewrites";
import { applyDocumentVectors, loadEvalVectors, queryVector } from "./vectors";

/** English questions, Chinese questions, and exact lookups in either language. */
const SUITES = ["expanded", "crosslingual", "exact"] as const;

type Search = (query: string, extra?: CorpusSearchOptions) => CorpusHit[];

/** Chinese if the text has more Han characters than Latin letters, else English. */
function languageOf(text: string): "zh" | "en" {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return han > latin ? "zh" : "en";
}

/** Two ranked lists of the same kind, each note scored by its better result. */
function mergeByMax(a: CorpusHit[], b: CorpusHit[]): CorpusHit[] {
  const best = new Map<string, CorpusHit>();
  for (const hit of [...a, ...b]) {
    const seen = best.get(hit.path);
    if (!seen || hit.score > seen.score) best.set(hit.path, hit);
  }
  return [...best.values()].sort((x, y) => y.score - x.score || x.path.localeCompare(y.path));
}

// Searching each question in both languages. Decisions read the dev split only.
it("compares searching with and without a rewrite into the other language", async () => {
  const suites = SUITES.map((suite) => ({
    suite,
    items: loadEvaluationData(suite).retrieval.items,
  }));
  type Row = {
    model: string;
    mode: string;
    method: string;
    source: RewriteSource | "—";
    suite: string;
    all: number | null;
    dev: number | null;
    test: number | null;
    perQuery: (number | null)[];
  };
  const rows: Row[] = [];
  const score = (items: (typeof suites)[number]["items"], ranked: (query: string) => CorpusHit[]) =>
    items.map((item) => {
      const grades = Object.fromEntries(
        Object.entries(item.judgments).map(([file, j]) => [file, j.grade]),
      );
      return scoreRetrieval(
        ranked(item.query)
          .slice(0, 10)
          .map((hit) => hit.path),
        grades,
      ).mrr;
    });
  const add = (
    base: Omit<Row, "suite" | "all" | "dev" | "test" | "perQuery">,
    ranked: (query: string) => CorpusHit[],
  ) => {
    for (const { suite, items } of suites) {
      const perQuery = score(items, ranked);
      const split = (name: string) =>
        meanMeasured(perQuery.filter((_, i) => items[i]!.split === name));
      rows.push({
        ...base,
        suite,
        all: meanMeasured(perQuery),
        dev: split("dev"),
        test: split("test"),
        perQuery,
      });
    }
  };

  const lexical = loadFixtureCorpus();
  // The languages the notes are written in, by script: here only English.
  const noteLanguages = new Set(
    lexical.paths().map((file) =>
      languageOf(
        lexical
          .get(file)!
          .sections.map((section) => section.text)
          .join("\n"),
      ),
    ),
  );
  for (const set of loadEvalVectors()) {
    const corpus = loadFixtureCorpus("both", { semantic: true });
    applyDocumentVectors(corpus, set);
    const fusion = fusionFor(set.model);
    const modes: [string, Search][] = [
      ["lexical", (query, extra = {}) => lexical.search(query, { limit: 50, ...extra })],
      [
        "semantic",
        (query, extra = {}) =>
          corpus.search(query, {
            mode: "semantic",
            queryVector: queryVector(set, query),
            limit: 50,
            ...extra,
          }),
      ],
      [
        `hybrid-${fusion.method}${fusion.method === "convex" ? `(${fusion.alpha})` : ""}`,
        (query, extra = {}) =>
          corpus.search(query, {
            mode: "hybrid",
            queryVector: queryVector(set, query),
            fusion,
            limit: 50,
            ...extra,
          }),
      ],
    ];
    for (const [mode, search] of modes) {
      // Lexical results do not depend on the model; record them once.
      if (mode === "lexical" && rows.some((row) => row.mode === "lexical")) continue;
      const model = mode === "lexical" ? "—" : set.model;
      add({ model, mode, method: "original only", source: "—" }, (query) => search(query));
      for (const source of REWRITE_SOURCES) {
        const rewrites = loadRewrites(source);
        // Queries without a rewrite are searched as they are.
        const withRewrite = (query: string) => {
          const rewrite = rewrites.get(query);
          return rewrite
            ? search(query, {
                alternates: [
                  {
                    query: rewrite,
                    ...(mode !== "lexical" && { queryVector: queryVector(set, rewrite) }),
                  },
                ],
              })
            : search(query);
        };
        add({ model, mode, method: "together", source }, withRewrite);
        add({ model, mode, method: "separately, best score", source }, (query) => {
          const rewrite = rewrites.get(query);
          return rewrite ? mergeByMax(search(query), search(rewrite)) : search(query);
        });
        add({ model, mode, method: "rewrite only", source }, (query) =>
          search(rewrites.get(query) ?? query),
        );
        // Added after the first run: rewrite only into a language the notes are written in.
        // For this English corpus, Chinese questions get their English rewrite; English
        // questions are searched as they are.
        const intoNotesLanguage = (query: string) =>
          !noteLanguages.has(languageOf(query)) && rewrites.has(query);
        add({ model, mode, method: "together, into the notes' language", source }, (query) =>
          intoNotesLanguage(query) ? withRewrite(query) : search(query),
        );
        add({ model, mode, method: "separately, into the notes' language", source }, (query) =>
          intoNotesLanguage(query)
            ? mergeByMax(search(query), search(rewrites.get(query)!))
            : search(query),
        );
      }
    }
  }

  // Paired differences against the same model and mode without a rewrite.
  const baseOf = (row: Row) =>
    rows.find(
      (r) =>
        r.model === row.model &&
        r.mode === row.mode &&
        r.suite === row.suite &&
        r.method === "original only",
    )!;
  const items = Object.fromEntries(suites.map(({ suite, items }) => [suite, items]));
  const comparisons = rows
    .filter((row) => row.method !== "original only")
    .map((row) => ({
      ...row,
      perQuery: undefined,
      ...pairedBootstrap(
        row.perQuery.map((value, i) => ({
          group: items[row.suite]![i]!.family,
          baseline: baseOf(row).perQuery[i]!,
          candidate: value,
        })),
      ),
    }));

  const pct = (value: number | null) => (value === null ? "—" : (value * 100).toFixed(1));
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}`;
  const keyOf = (row: Row) => `${row.model}|${row.mode}|${row.method}|${row.source}`;
  const configs = [...new Map(rows.map((row) => [keyOf(row), row])).values()];
  const cell = (config: Row, suite: string, field: "all" | "dev" | "test") =>
    rows.find((row) => keyOf(row) === keyOf(config) && row.suite === suite)![field];
  const macroDev = (config: Row) =>
    SUITES.reduce((sum, suite) => sum + (cell(config, suite, "dev") ?? 0), 0) / SUITES.length;
  const lines = [
    "# Searching with a rewrite into the other language",
    "",
    "MRR@10. Each question is also searched in its other-language rewrite: together (keywords from both, each section's closer query vector), separately with each note's better score, or with the rewrite alone. reference rewrites come from the suites (exact for Chinese queries, none for the exact suite); llm and llama3 are frozen blind model rewrites. Queries without a rewrite are searched as they are. Decisions read dev only.",
    "",
    `| Model | Mode | Method | Rewrite | ${SUITES.map((s) => `${s} all / dev / test`).join(" | ")} | Macro dev |`,
    `| --- | --- | --- | --- | ${SUITES.map(() => "---").join(" | ")} | ---: |`,
    ...configs.map(
      (config) =>
        `| ${config.model} | ${config.mode} | ${config.method} | ${config.source} | ${SUITES.map((suite) => `${pct(cell(config, suite, "all"))} / ${pct(cell(config, suite, "dev"))} / ${pct(cell(config, suite, "test"))}`).join(" | ")} | ${pct(macroDev(config))} |`,
    ),
    "",
    "## Paired differences against the same mode without a rewrite (all queries)",
    "",
    "| Model | Mode | Method | Rewrite | Suite | Δ MRR | 95% interval |",
    "| --- | --- | --- | --- | --- | ---: | --- |",
    ...comparisons.map(
      (c) =>
        `| ${c.model} | ${c.mode} | ${c.method} | ${c.source} | ${c.suite} | ${c.delta === null ? "—" : signed(c.delta)} | ${c.ci95 ? `${signed(c.ci95[0]!)} to ${signed(c.ci95[1]!)}` : "—"} |`,
    ),
    "",
  ];
  const out = reportDestination(import.meta.dirname, process.env.EVAL_REPORT_DIR);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "rewrite.json"),
    await format(JSON.stringify({ suites: SUITES, rows, comparisons }), {
      parser: "json",
      printWidth: 100,
    }),
  );
  writeFileSync(
    path.join(out, "rewrite.md"),
    await format(lines.join("\n"), { parser: "markdown" }),
  );
  console.log(
    lines
      .slice(
        0,
        lines.indexOf(
          "## Paired differences against the same mode without a rewrite (all queries)",
        ),
      )
      .join("\n"),
  );
}, 900_000);
