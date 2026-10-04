import { describe, expect, it } from "vitest";

import { resolveSettings, stageForPath } from "../settings";
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
