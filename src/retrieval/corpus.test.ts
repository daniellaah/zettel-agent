import { describe, expect, it } from "vitest";

import { resolveSettings, stageForPath } from "../settings";
import { FakeEmbedder } from "../testing/fake-embedder";
import { Corpus, quotedPhrases } from "./corpus";

function makeCorpus() {
  const settings = resolveSettings({ zettelkastenRoot: "Z" });
  const corpus = new Corpus({ stageForPath: (path) => stageForPath(path, settings) });
  corpus.upsert(
    "Z/Permanent/Atomic notes.md",
    "# Atomic notes\n\nOne idea per note. See [[Linking]].",
  );
  corpus.upsert(
    "Z/Permanent/Linking.md",
    "---\ntags: [method/linking]\n---\n# Linking\n\nLinks need a reason.",
  );
  corpus.upsert("Z/Fleeting/idea.md", "---\ntype: literature\n---\nan idea about links");
  corpus.upsert("Z/Fleeting/raw.md", "one more idea");
  return corpus;
}

describe("Corpus", () => {
  it("derives stages from folders, with frontmatter type as an override", () => {
    const corpus = makeCorpus();
    expect(corpus.stage("Z/Permanent/Linking.md")).toBe("permanent");
    expect(corpus.stage("Z/Fleeting/raw.md")).toBe("fleeting");
    expect(corpus.stage("Z/Fleeting/idea.md")).toBe("literature");
  });

  it("filters search by stage, folder and tag prefix", () => {
    const corpus = makeCorpus();
    expect(corpus.search("idea", { stages: ["fleeting"] })).toEqual([]);
    expect(corpus.search("idea", { folder: "Z/Permanent" }).map((h) => h.path)).toEqual([
      "Z/Permanent/Atomic notes.md",
    ]);
    expect(corpus.search("links", { tag: "#method" }).map((h) => h.path)).toEqual([
      "Z/Permanent/Linking.md",
    ]);
  });

  it("rebuilds the link graph after changes", () => {
    const corpus = makeCorpus();
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toEqual([
      "Z/Permanent/Atomic notes.md",
    ]);
    corpus.upsert("Z/Permanent/Atomic notes.md", "# Atomic notes\n\nNo links now.");
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toEqual([]);
  });

  it("skips re-indexing unchanged content", () => {
    const corpus = makeCorpus();
    const before = corpus.get("Z/Permanent/Linking.md");
    expect(
      corpus.upsert(
        "Z/Permanent/Linking.md",
        "---\ntags: [method/linking]\n---\n# Linking\n\nLinks need a reason.",
      ),
    ).toBe(before);
  });

  it("moves a note on rename", () => {
    const corpus = makeCorpus();
    corpus.rename("Z/Fleeting/raw.md", "Z/Permanent/raw.md", "one more idea");
    expect(corpus.get("Z/Fleeting/raw.md")).toBeUndefined();
    expect(corpus.stage("Z/Permanent/raw.md")).toBe("permanent");
  });

  it("excludes captures from storage, resolution and the link graph", () => {
    const corpus = makeCorpus();
    corpus.upsert("Z/Fleeting/raw.md", "OnlyCaptureTerm [[Linking]]");
    corpus.upsert("Z/Permanent/Atomic notes.md", "See [[raw]]");
    expect(corpus.size).toBe(3);
    expect(corpus.paths()).not.toContain("Z/Fleeting/raw.md");
    expect(corpus.get("Z/Fleeting/raw.md")).toBeUndefined();
    expect(corpus.resolve("raw")).toBeNull();
    expect(corpus.search("OnlyCaptureTerm")).toEqual([]);
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toEqual([]);
  });

  it("uses frontmatter overrides when deciding whether to exclude a note", () => {
    const corpus = makeCorpus();
    corpus.upsert("Z/Permanent/raw.md", "---\ntype: fleeting\n---\nOnlyCaptureTerm");
    expect(corpus.get("Z/Permanent/raw.md")).toBeUndefined();
    expect(corpus.get("Z/Fleeting/idea.md")).toBeDefined();
    expect(corpus.search("OnlyCaptureTerm")).toEqual([]);
  });

  it("removes stale search entries and graph edges when a note becomes fleeting", () => {
    const corpus = makeCorpus();
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toHaveLength(1);
    corpus.upsert("Z/Permanent/Atomic notes.md", "---\ntype: fleeting\n---\n[[Linking]]");
    expect(corpus.get("Z/Permanent/Atomic notes.md")).toBeUndefined();
    expect(corpus.search("atomic")).toEqual([]);
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toEqual([]);
    corpus.upsert("Z/Permanent/Atomic notes.md", "---\ntype: permanent\n---\nAtomic [[Linking]]");
    expect(corpus.search("atomic")).toHaveLength(1);
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toHaveLength(1);
  });

  it("excludes an indexed note after it moves into the fleeting folder", () => {
    const corpus = makeCorpus();
    corpus.rename("Z/Permanent/Atomic notes.md", "Z/Fleeting/raw.md", "Atomic [[Linking]]");
    expect(corpus.resolve("Atomic notes")).toBeNull();
    expect(corpus.resolve("raw")).toBeNull();
    expect(corpus.search("atomic")).toEqual([]);
    expect(corpus.graph().backlinks("Z/Permanent/Linking.md")).toEqual([]);
  });
});

it("shares empty stage semantics and binds revision to path/content/stage changes", () => {
  let stage: "permanent" | "literature" = "permanent";
  const corpus = new Corpus({ stageForPath: () => stage });
  corpus.upsert("P/A.md", "---\ntags: [topic/sub]\n---\nalpha");
  const revision = corpus.revision;
  expect(corpus.eligible("P/A.md", { stages: [], folder: "P/", tag: "#TOPIC" })).toBe(true);
  expect(corpus.eligible("outside.md")).toBe(false);
  expect(corpus.eligible("P/A.md", { stages: ["writing"] })).toBe(false);
  expect(corpus.eligible("P/A.md", { folder: "Other" })).toBe(false);
  expect(corpus.eligible("P/A.md", { tag: "absent" })).toBe(false);
  corpus.upsert("P/A.md", "---\ntags: [topic/sub]\n---\nalpha");
  expect(corpus.revision).toBe(revision);
  stage = "literature";
  expect(corpus.revision).not.toBe(revision);
  corpus.rename("P/A.md", "P/New.md", "alpha");
  expect(corpus.eligible("P/A.md")).toBe(false);
});

describe("semantic and hybrid search", () => {
  // The fake model knows "standardization" and "标准化" mean what the note calls "scaling".
  const embedder = new FakeEmbedder({ standardization: "scaling", 标准化: "scaling" });
  const PREPROCESSING = "Z/Permanent/Preprocessing must respect the fold boundary.md";
  const FOLDS = "Z/Permanent/Rotating held-out folds.md";

  async function semanticCorpus() {
    const settings = resolveSettings({ zettelkastenRoot: "Z" });
    const corpus = new Corpus({
      stageForPath: (path) => stageForPath(path, settings),
      semantic: true,
    });
    corpus.upsert(
      PREPROCESSING,
      "# Preprocessing must respect the fold boundary\n\nFit scaling statistics on the training fold only.",
    );
    corpus.upsert(
      FOLDS,
      "# Rotating held-out folds\n\nCross-validation rotates the held-out fold.",
    );
    corpus.upsert("Z/Permanent/Atomic notes.md", "# Atomic notes\n\nOne idea per note.");
    corpus.upsert("Z/Fleeting/scaling.md", "standardization scaling");
    const pending = corpus.dense!.pending();
    const vectors = await embedder.embed(
      pending.map((p) => p.text),
      "document",
    );
    pending.forEach(({ key }, i) => corpus.dense!.set(key, vectors[i]!));
    return corpus;
  }
  const vector = async (query: string) => (await embedder.embed([query], "query"))[0]!;

  it("finds a note by meaning when it shares no words with the query", async () => {
    const corpus = await semanticCorpus();
    const query = "standardization before cross-validation";
    expect(corpus.search(query).map((h) => h.path)).toEqual([FOLDS]);
    const semantic = corpus.search("标准化", {
      mode: "semantic",
      queryVector: await vector("标准化"),
    });
    expect(semantic[0]).toMatchObject({
      path: PREPROCESSING,
      lexicalRank: null,
      semanticRank: 1,
      matchedTerms: [],
    });
    expect(semantic[0]!.score).toBeGreaterThan(0);
    // Fleeting captures stay out of semantic results too.
    expect(semantic.map((h) => h.path)).not.toContain("Z/Fleeting/scaling.md");
  });

  it("merges keyword and semantic candidates and reports where each came from", async () => {
    const corpus = await semanticCorpus();
    const query = "standardization before cross-validation";
    const hits = corpus.search(query, { mode: "hybrid", queryVector: await vector(query) });
    const byPath = new Map(hits.map((h) => [h.path, h]));
    expect(byPath.get(FOLDS)).toMatchObject({
      lexicalRank: 1,
      matchedTerms: ["cross", "validation", "cross-validation"],
    });
    expect(byPath.get(PREPROCESSING)).toMatchObject({ lexicalRank: null, semanticRank: 1 });
    expect(hits[0]!.score).toBeLessThanOrEqual(2 / 61);
    expect(
      corpus.search(query, { mode: "hybrid", queryVector: await vector(query), limit: 1 }),
    ).toHaveLength(1);
    expect(
      corpus
        .search(query, { mode: "hybrid", queryVector: await vector(query), folder: "Z/Other" })
        .map((h) => h.path),
    ).toEqual([]);
  });

  it("can fuse by a convex combination of normalized BM25 and cosine similarity", async () => {
    const corpus = await semanticCorpus();
    const query = "standardization before cross-validation";
    const queryVector = await vector(query);
    const search = (alpha: number) =>
      corpus.search(query, {
        mode: "hybrid",
        queryVector,
        fusion: { method: "convex", alpha },
        limit: 3,
      });
    expect(search(0).map((h) => h.path)).toEqual(
      corpus.search(query, { mode: "semantic", queryVector, limit: 3 }).map((h) => h.path),
    );
    expect(search(1)[0]!.path).toBe(FOLDS);
    // Normalized BM25 never exceeds 1, so alpha = 1 scores stay in [0, 1].
    for (const hit of search(1)) expect(hit.score).toBeLessThanOrEqual(1);
    const half = search(0.5);
    const cosine = corpus.dense!.similarity(
      queryVector,
      PREPROCESSING,
      half.find((h) => h.path === PREPROCESSING)!.sectionId,
    )!;
    expect(half.find((h) => h.path === PREPROCESSING)!.score).toBeCloseTo(0.5 * cosine);
  });

  it("returns one section per note unless asked for more", async () => {
    const corpus = await semanticCorpus();
    corpus.upsert(
      PREPROCESSING,
      "# Preprocessing must respect the fold boundary\n\nFit scaling on the training fold.\n\n## Scaling\n\nScaling statistics leak.",
    );
    const pending = corpus.dense!.pending();
    const vectors = await embedder.embed(
      pending.map((p) => p.text),
      "document",
    );
    pending.forEach(({ key }, i) => corpus.dense!.set(key, vectors[i]!));
    const queryVector = await vector("standardization");
    const one = corpus.search("standardization", { mode: "semantic", queryVector });
    expect(one.filter((h) => h.path === PREPROCESSING)).toHaveLength(1);
    const two = corpus.search("standardization", { mode: "semantic", queryVector, perNote: 2 });
    expect(two.filter((h) => h.path === PREPROCESSING)).toHaveLength(2);
  });

  it("needs a query vector and a semantic corpus", async () => {
    const corpus = await semanticCorpus();
    expect(() => corpus.search("x", { mode: "hybrid" })).toThrow("needs a semantic corpus");
    const lexicalOnly = new Corpus({ stageForPath: () => "permanent" });
    expect(lexicalOnly.dense).toBeNull();
    expect(() =>
      lexicalOnly.search("x", { mode: "semantic", queryVector: new Float32Array(1) }),
    ).toThrow("needs a semantic corpus");
  });
});

describe("keyword search details", () => {
  function corpusWith(options: Partial<ConstructorParameters<typeof Corpus>[0]> = {}) {
    const corpus = new Corpus({ stageForPath: () => "permanent", ...options });
    corpus.upsert("P/Zettelkasten note system.md", "# Zettelkasten note system\n\nOne idea each.");
    corpus.upsert("P/QLoRA precision.md", "# QLoRA precision\n\nFour-bit NormalFloat storage.");
    corpus.upsert("P/GRPO.md", "# GRPO\n\nIts objective includes clipped policy-ratio terms.");
    corpus.upsert("P/Checks.md", "# Checks\n\nA ratio and a ratio guard the policy and policy.");
    corpus.upsert("P/Trees.md", "# Correlated trees\n\nShared variation survives the average.");
    corpus.upsert("P/Average.md", "# Average survives\n\nAverage, average and survives.");
    return corpus;
  }

  it("ignores words that refer to the vault itself", () => {
    const query = "Which note mentions NormalFloat?";
    expect(corpusWith().search(query)[0]!.path).toBe("P/QLoRA precision.md");
    expect(corpusWith().search("note")[0]!.path).toBe("P/Zettelkasten note system.md");
    const off = corpusWith({ lexical: { queryStopwords: false } });
    expect(off.search(query)[0]!.path).toBe("P/Zettelkasten note system.md");
  });

  it("matches a hyphenated term whole before its parts", () => {
    expect(corpusWith().search("policy-ratio")[0]!.path).toBe("P/GRPO.md");
    const off = corpusWith({ lexical: { compounds: false } });
    expect(off.search("policy-ratio")[0]!.path).toBe("P/Checks.md");
  });

  it("ranks sections with every quoted phrase first", () => {
    expect(quotedPhrases('find “Shared  Variation” and "the average" or 「卡片」')).toEqual([
      "shared variation",
      "the average",
      "卡片",
    ]);
    const corpus = corpusWith();
    expect(corpus.search("“survives the average”")[0]!.path).toBe("P/Trees.md");
    expect(corpus.search("“survives the average”", { folder: "Other" })).toEqual([]);
    const off = corpusWith({ phrases: false });
    expect(off.search("“survives the average”")[0]!.path).toBe("P/Average.md");
  });

  it("bounds normalized keyword scores by the query's highest possible score", () => {
    const corpus = corpusWith();
    const hit = corpus.search("GRPO")[0]!;
    const index = (corpus as unknown as { index: { maxScore(q: string): number } }).index;
    expect(hit.score / index.maxScore("GRPO")).toBeLessThanOrEqual(1);
    // An unknown word adds unmatched mass: the same hit explains less of the query.
    expect(index.maxScore("GRPO 未知")).toBeGreaterThan(index.maxScore("GRPO"));
  });
});
