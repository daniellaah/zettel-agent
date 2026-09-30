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
    expect(corpus.search("idea", { stages: ["fleeting"] }).map((h) => h.path)).toEqual([
      "Z/Fleeting/raw.md",
    ]);
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
    const before = corpus.get("Z/Fleeting/raw.md");
    expect(corpus.upsert("Z/Fleeting/raw.md", "one more idea")).toBe(before);
  });

  it("moves a note on rename", () => {
    const corpus = makeCorpus();
    corpus.rename("Z/Fleeting/raw.md", "Z/Permanent/raw.md", "one more idea");
    expect(corpus.get("Z/Fleeting/raw.md")).toBeUndefined();
    expect(corpus.stage("Z/Permanent/raw.md")).toBe("permanent");
  });
});
