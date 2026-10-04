import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { Corpus, type CorpusOptions } from "../src/retrieval/corpus";
import type { TokenizerMode } from "../src/retrieval/tokenize";
import { resolveSettings, stageForPath } from "../src/settings";
import {
  answerSetSchema,
  manifestSchema,
  poolExtensionSchema,
  retrievalSetSchema,
  translationSetSchema,
  type RetrievalSet,
} from "./schema";

export const VAULT_DIR = path.resolve(import.meta.dirname, "../fixtures/vault");
export const ZETTELKASTEN_ROOT = "02-Zettelkasten";

/**
 * pilot and expanded are English; crosslingual asks the expanded questions in Chinese;
 * exact looks up rare terms and phrases, the case keyword search exists for, as questions;
 * exact-terms sends only the term or phrase, as an agent's search call usually does.
 */
export const SUITES = ["pilot", "expanded", "crosslingual", "exact", "exact-terms"] as const;

/** "frozen" reproduces the original labels; "extended" adds the AI-judged pool extension. */
export type LabelSet = "frozen" | "extended";

export function evaluationFiles(suite = "pilot", labels: LabelSet = "extended") {
  if (!(SUITES as readonly string[]).includes(suite))
    throw new Error(`Unknown evaluation suite: ${suite}`);
  const dir =
    suite === "pilot" ? import.meta.dirname : path.join(import.meta.dirname, "suites/expanded");
  return {
    retrieval:
      suite === "exact" || suite === "exact-terms"
        ? path.join(import.meta.dirname, "suites/exact/retrieval.json")
        : path.join(dir, "retrieval.json"),
    // Retrieval-only suites validate against the expanded rubrics and add no answers.
    answers: path.join(dir, "answers.json"),
    ...(suite === "crosslingual" && {
      translations: path.join(import.meta.dirname, "suites/crosslingual/queries.json"),
    }),
    ...(labels === "extended" &&
      (suite === "expanded" || suite === "crosslingual") && {
        poolExtension: path.join(import.meta.dirname, "suites/pool-extension/judgments.json"),
      }),
  };
}

export function loadEvaluationData(
  suite = process.env.EVAL_SUITE ?? "pilot",
  labels: LabelSet = process.env.EVAL_LABELS === "frozen" ? "frozen" : "extended",
) {
  const files = evaluationFiles(suite, labels);
  let retrieval = retrievalSetSchema.parse(JSON.parse(readFileSync(files.retrieval, "utf8")));
  if (files.poolExtension) retrieval = extendPool(retrieval, files.poolExtension);
  return {
    manifest: manifestSchema.parse(readJson("corpus-manifest.json")),
    labels,
    retrieval: files.translations
      ? translate(retrieval, files.translations)
      : suite === "exact-terms"
        ? termsOnly(retrieval)
        : retrieval,
    answers: answerSetSchema.parse(JSON.parse(readFileSync(files.answers, "utf8"))),
    files,
  };
}

/** Adds judgments for never-judged candidates; a judgment that already exists is a conflict. */
function extendPool(retrieval: RetrievalSet, file: string): RetrievalSet {
  const extension = poolExtensionSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (extension.corpusId !== retrieval.corpusId)
    throw new Error("Pool extension corpusId mismatch");
  const extended = structuredClone(retrieval);
  for (const { id, judgments } of extension.items) {
    const item = extended.items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Pool extension names an unknown item: ${id}`);
    for (const [path, judgment] of Object.entries(judgments)) {
      if (item.judgments[path]) throw new Error(`Pool extension rejudges ${id}: ${path}`);
      item.judgments[path] = judgment;
    }
  }
  return extended;
}

/** Same items and labels, asking for the looked-up term or phrase alone. */
function termsOnly(retrieval: RetrievalSet): RetrievalSet {
  return {
    ...retrieval,
    items: retrieval.items.map((item) => {
      if (!("term" in item.pool)) throw new Error(`${item.id} has no looked-up term`);
      return { ...item, query: item.pool.term, lang: "en" };
    }),
  };
}

/** Same items and labels, with each query replaced by its restatement. */
function translate(retrieval: RetrievalSet, file: string): RetrievalSet {
  const translations = translationSetSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const queries = new Map(translations.items.map((item) => [item.id, item.query]));
  if (
    translations.corpusId !== retrieval.corpusId ||
    queries.size !== translations.items.length ||
    retrieval.items.length !== queries.size ||
    retrieval.items.some((item) => !queries.has(item.id))
  )
    throw new Error("Translations must restate every source item exactly once.");
  return {
    ...retrieval,
    items: retrieval.items.map((item) => ({ ...item, query: queries.get(item.id)!, lang: "zh" })),
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, file), "utf8"));
}

/** Loads the fixture vault's Zettelkasten folder the way the plugin does. */
export function loadFixtureCorpus(
  mode: TokenizerMode = "both",
  options: Pick<CorpusOptions, "semantic" | "lexical" | "phrases"> = {},
): Corpus {
  const settings = resolveSettings({ zettelkastenRoot: ZETTELKASTEN_ROOT });
  const corpus = new Corpus({ mode, stageForPath: (p) => stageForPath(p, settings), ...options });
  for (const file of walk(path.join(VAULT_DIR, ZETTELKASTEN_ROOT))) {
    corpus.upsert(path.relative(VAULT_DIR, file), readFileSync(file, "utf8"));
  }
  return corpus;
}

export function walk(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const full = path.join(dir, name);
      if (name.startsWith(".")) return [];
      if (statSync(full).isDirectory()) return walk(full);
      return name.endsWith(".md") ? [full] : [];
    })
    .sort();
}
