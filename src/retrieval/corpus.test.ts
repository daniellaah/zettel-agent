import { describe, expect, it } from "vitest";

import { resolveSettings, stageForPath } from "../settings";
import { FakeEmbedder } from "../testing/fake-embedder";
import { Corpus } from "./corpus";

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
      matchedTerms: ["cross", "validation"],
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
