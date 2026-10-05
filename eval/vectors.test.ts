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

describe("pool extension", () => {
  it("only adds judgments to never-judged candidates, and can be switched off", () => {
    const frozen = loadEvaluationData("expanded", "frozen");
    const extended = loadEvaluationData("expanded", "extended");
    expect(frozen.files).not.toHaveProperty("poolExtension");
    let added = 0;
    extended.retrieval.items.forEach((item, i) => {
      const original = frozen.retrieval.items[i]!.judgments;
      for (const [path, judgment] of Object.entries(original))
        expect(item.judgments[path]).toEqual(judgment);
      added += Object.keys(item.judgments).length - Object.keys(original).length;
    });
    expect(added).toBeGreaterThan(0);
    expect(
      validateSets(extended.manifest, extended.retrieval, extended.answers, loadFixtureCorpus()),
    ).toEqual([]);
    const chinese = loadEvaluationData("crosslingual", "extended");
    expect(chinese.retrieval.items.map((item) => item.judgments)).toEqual(
      extended.retrieval.items.map((item) => item.judgments),
    );
  });
});

describe("exact-term suite", () => {
  it("judges exactly the frozen notes that contain each term", () => {
    const exact = loadEvaluationData("exact");
    expect(exact.retrieval.items).toHaveLength(32);
    expect(exact.retrieval.items.every((item) => item.kind === "exact")).toBe(true);
    expect(
      validateSets(exact.manifest, exact.retrieval, exact.answers, loadFixtureCorpus()),
    ).toEqual([]);
    const broken = structuredClone(exact.retrieval);
    delete broken.items[0]!.judgments[Object.keys(broken.items[0]!.judgments)[0]!];
    expect(validateSets(exact.manifest, broken, exact.answers, loadFixtureCorpus())).toContain(
      "x01: term-occurrence labels differ from the notes containing the term",
    );
  });
});

describe("exact-terms suite", () => {
  it("sends only the looked-up term or phrase, with the exact suite's labels", () => {
    const exact = loadEvaluationData("exact");
    const terms = loadEvaluationData("exact-terms");
    terms.retrieval.items.forEach((item, i) => {
      const source = exact.retrieval.items[i]!;
      expect(item.query).toBe("term" in source.pool ? source.pool.term : null);
      expect(item.judgments).toEqual(source.judgments);
      expect(item.lang).toBe("en");
    });
    expect(
      validateSets(terms.manifest, terms.retrieval, terms.answers, loadFixtureCorpus()),
    ).toEqual([]);
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
