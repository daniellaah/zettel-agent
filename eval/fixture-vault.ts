import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { Corpus } from "../src/retrieval/corpus";
import type { TokenizerMode } from "../src/retrieval/tokenize";
import { resolveSettings, stageForPath } from "../src/settings";

export const VAULT_DIR = path.resolve(import.meta.dirname, "../fixtures/vault");
export const ZETTELKASTEN_ROOT = "02-Zettelkasten";

export interface Judgment {
  id: string;
  query: string;
  lang: "zh" | "en" | "mixed";
  kind: string;
  relevant: string[];
  notes: string;
}

export function loadJudgments(file = "judgments.draft.json"): Judgment[] {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, file), "utf8")) as Judgment[];
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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith(".md") ? [full] : [];
  });
}
