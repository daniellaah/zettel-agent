import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { Corpus } from "../src/retrieval/corpus";
import type { TokenizerMode } from "../src/retrieval/tokenize";
import { resolveSettings, stageForPath } from "../src/settings";
import { answerSetSchema, manifestSchema, retrievalSetSchema } from "./schema";

export const VAULT_DIR = path.resolve(import.meta.dirname, "../fixtures/vault");
export const ZETTELKASTEN_ROOT = "02-Zettelkasten";

export function evaluationFiles(suite = "pilot") {
  if (!["pilot", "expanded"].includes(suite)) throw new Error(`Unknown evaluation suite: ${suite}`);
  const dir =
    suite === "pilot" ? import.meta.dirname : path.join(import.meta.dirname, "suites/expanded");
  return { retrieval: path.join(dir, "retrieval.json"), answers: path.join(dir, "answers.json") };
}

export function loadEvaluationData(suite = process.env.EVAL_SUITE ?? "pilot") {
  const files = evaluationFiles(suite);
  return {
    manifest: manifestSchema.parse(readJson("corpus-manifest.json")),
    retrieval: retrievalSetSchema.parse(JSON.parse(readFileSync(files.retrieval, "utf8"))),
    answers: answerSetSchema.parse(JSON.parse(readFileSync(files.answers, "utf8"))),
    files,
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, file), "utf8"));
}

/** Loads the fixture vault's Zettelkasten folder the way the plugin does. */
export function loadFixtureCorpus(mode: TokenizerMode = "both"): Corpus {
  const settings = resolveSettings({ zettelkastenRoot: ZETTELKASTEN_ROOT });
  const corpus = new Corpus({ mode, stageForPath: (p) => stageForPath(p, settings) });
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
