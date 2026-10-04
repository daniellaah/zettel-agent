import { describe, expect, it } from "vitest";

import { dot } from "../src/retrieval/embedding";
import { evaluationFiles, loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { validateSets } from "./validate";
import {
  applyDocumentVectors,
  evaluationQueries,
  loadEvalVectors,
  queryVector,
  vectorFilePath,
} from "./vectors";

describe("cross-lingual suite", () => {
  it("restates every expanded query in Chinese with unchanged labels", () => {
    const expanded = loadEvaluationData("expanded");
    const chinese = loadEvaluationData("crosslingual");
    expect(chinese.retrieval.items).toHaveLength(expanded.retrieval.items.length);
    chinese.retrieval.items.forEach((item, i) => {
      const source = expanded.retrieval.items[i]!;
      expect(item).toEqual({ ...source, query: item.query, lang: "zh" });
      expect(item.query).toMatch(/\p{Script=Han}/u);
    });
    expect(
      validateSets(chinese.manifest, chinese.retrieval, chinese.answers, loadFixtureCorpus()),
    ).toEqual([]);
    expect(evaluationFiles("crosslingual").translations).toMatch(/crosslingual\/queries\.json$/);
    expect(evaluationFiles("expanded")).not.toHaveProperty("translations");
  });
});

describe("frozen evaluation vectors", () => {
  it("cover every frozen section and every evaluation query with unit vectors", () => {
    const sets = loadEvalVectors();
    expect(sets.map((set) => set.file)).toContain(vectorFilePath("qwen3-embedding:0.6b"));
    const frozen = new Set(loadEvaluationData().manifest.notes.map((note) => note.path));
    for (const set of sets) {
      expect(set.embedder).toMatch(new RegExp(`^ollama:${set.model.replace(/\./g, "\\.")}@`));
      const corpus = loadFixtureCorpus("both", { semantic: true });
      for (const path of corpus.paths()) if (!frozen.has(path)) corpus.remove(path);
      applyDocumentVectors(corpus, set);
      expect(corpus.dense!.coverage()).toEqual({ embedded: frozen.size, total: frozen.size });
      for (const query of evaluationQueries()) {
        const vector = queryVector(set, query);
        expect(vector).toHaveLength(set.dimensions);
        expect(dot(vector, vector)).toBeCloseTo(1, 4);
      }
    }
  });
});
