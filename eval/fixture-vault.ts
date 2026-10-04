import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { Corpus } from "../src/retrieval/corpus";
import type { TokenizerMode } from "../src/retrieval/tokenize";
import { resolveSettings, stageForPath } from "../src/settings";
import {
  answerSetSchema,
  manifestSchema,
  retrievalSetSchema,
  translationSetSchema,
  type RetrievalSet,
} from "./schema";

export const VAULT_DIR = path.resolve(import.meta.dirname, "../fixtures/vault");
export const ZETTELKASTEN_ROOT = "02-Zettelkasten";

/** pilot and expanded are English; crosslingual asks the expanded questions in Chinese. */
export const SUITES = ["pilot", "expanded", "crosslingual"] as const;

export function evaluationFiles(suite = "pilot") {
  if (!(SUITES as readonly string[]).includes(suite))
    throw new Error(`Unknown evaluation suite: ${suite}`);
  const dir =
    suite === "pilot" ? import.meta.dirname : path.join(import.meta.dirname, "suites/expanded");
  return {
    retrieval: path.join(dir, "retrieval.json"),
    answers: path.join(dir, "answers.json"),
    ...(suite === "crosslingual" && {
      translations: path.join(import.meta.dirname, "suites/crosslingual/queries.json"),
    }),
  };
}

export function loadEvaluationData(suite = process.env.EVAL_SUITE ?? "pilot") {
  const files = evaluationFiles(suite);
  const retrieval = retrievalSetSchema.parse(JSON.parse(readFileSync(files.retrieval, "utf8")));
  return {
    manifest: manifestSchema.parse(readJson("corpus-manifest.json")),
    retrieval: files.translations ? translate(retrieval, files.translations) : retrieval,
    answers: answerSetSchema.parse(JSON.parse(readFileSync(files.answers, "utf8"))),
    files,
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
  options: { semantic?: boolean } = {},
): Corpus {
  const settings = resolveSettings({ zettelkastenRoot: ZETTELKASTEN_ROOT });
  const corpus = new Corpus({
    mode,
    stageForPath: (p) => stageForPath(p, settings),
    ...(options.semantic && { semantic: true }),
  });
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
