import { describe, expect, it } from "vitest";

import { FakeEmbedder } from "../testing/fake-embedder";
import { DenseIndex } from "./dense-index";
import { sectionEmbeddingText, unitVector } from "./embedding";
import { parseNote } from "./markdown";

const embedder = new FakeEmbedder({ standardization: "scaling", 标准化: "scaling" });

async function fill(index: DenseIndex) {
  const pending = index.pending();
  const vectors = await embedder.embed(
    pending.map((p) => p.text),
    "document",
  );
  pending.forEach(({ key }, i) => index.set(key, vectors[i]!));
  return pending.length;
}

const PREPROCESSING = parseNote(
  "P/Preprocessing respects folds.md",
  "# Preprocessing respects folds\n\nFit scaling statistics inside each training fold.\n\n## Example\n\nA scaler fitted on all rows leaks test information.",
);
const ATOMIC = parseNote("P/Atomic notes.md", "# Atomic notes\n\nOne idea per note.");

describe("sectionEmbeddingText", () => {
  it("prefixes the title and heading path without repeating the heading line", () => {
    const [intro, example] = PREPROCESSING.sections;
    expect(sectionEmbeddingText(PREPROCESSING, intro!)).toBe(
      "Preprocessing respects folds\n\nFit scaling statistics inside each training fold.",
    );
    expect(sectionEmbeddingText(PREPROCESSING, example!)).toBe(
      "Preprocessing respects folds › Example\n\nA scaler fitted on all rows leaks test information.",
    );
  });

  it("keeps text before the first heading", () => {
    const note = parseNote("P/raw.md", "just a thought");
    expect(sectionEmbeddingText(note, note.sections[0]!)).toBe("raw\n\njust a thought");
  });
});

describe("DenseIndex", () => {
  it("ranks sections by closeness of meaning, with a filter", async () => {
    const index = new DenseIndex();
    index.upsert(PREPROCESSING);
    index.upsert(ATOMIC);
    expect(await fill(index)).toBe(3);
    expect(index.coverage()).toEqual({ embedded: 3, total: 3 });

    // "standardization" shares no word with the note, but means the same as "scaling".
    const [query] = await embedder.embed(["standardization statistics"], "query");
    const hits = index.search(query!);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toMatchObject({
      path: PREPROCESSING.path,
      sectionId: PREPROCESSING.sections[0]!.id,
    });
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(index.search(query!, { limit: 1 })).toHaveLength(1);
    expect(
      index.search(query!, { filter: (path) => path === ATOMIC.path }).map((h) => h.path),
    ).toEqual([ATOMIC.path]);
  });

  it("re-embeds only the sections whose text changed", async () => {
    const index = new DenseIndex();
    index.upsert(PREPROCESSING);
    await fill(index);
    const edited = parseNote(
      PREPROCESSING.path,
      "# Preprocessing respects folds\n\nFit scaling statistics inside each training fold.\n\n## Example\n\nA new example.",
    );
    index.upsert(edited);
    expect(index.pending().map((p) => p.text)).toEqual([
      "Preprocessing respects folds › Example\n\nA new example.",
    ]);
    expect(index.coverage()).toEqual({ embedded: 1, total: 2 });
  });

  it("reuses vectors by text after a remove and re-add, and drops stale pending text", async () => {
    const index = new DenseIndex();
    index.upsert(ATOMIC);
    index.upsert(parseNote("P/draft.md", "never embedded"));
    index.remove("P/draft.md");
    expect(index.pending()).toHaveLength(1);
    await fill(index);
    index.remove(ATOMIC.path);
    expect(index.coverage()).toEqual({ embedded: 0, total: 0 });
    expect(index.usedVectors().size).toBe(0);
    index.upsert(ATOMIC);
    expect(index.pending()).toEqual([]);
    expect(index.usedVectors().size).toBe(1);
  });

  it("rejects vectors of the wrong size", () => {
    const index = new DenseIndex();
    index.upsert(ATOMIC);
    index.set("a", unitVector([1, 0, 0]));
    expect(() => index.set("b", unitVector([1, 0]))).toThrow("Expected 3 dimensions");
    expect(() => index.search(unitVector([1, 0]))).toThrow("index has 3");
  });
});
