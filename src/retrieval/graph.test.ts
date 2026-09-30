import { describe, expect, it } from "vitest";

import { LinkGraph, basenameResolver } from "./graph";

const PATHS = [
  "Z/Permanent/A.md",
  "Z/Permanent/B.md",
  "Z/Permanent/C.md",
  "Z/Permanent/Orphan.md",
  "Z/Literature/B.md",
];

describe("basenameResolver", () => {
  const resolve = basenameResolver(PATHS);

  it("prefers an exact path, then the source folder, then the shortest path", () => {
    expect(resolve("Z/Literature/B", "Z/Permanent/A.md")).toBe("Z/Literature/B.md");
    expect(resolve("B", "Z/Permanent/A.md")).toBe("Z/Permanent/B.md");
    expect(resolve("b", "Z/Literature/x.md")).toBe("Z/Literature/B.md");
  });

  it("returns null for missing notes", () => {
    expect(resolve("Nope", "Z/Permanent/A.md")).toBeNull();
  });
});

describe("LinkGraph", () => {
  const graph = LinkGraph.build(
    new Map([
      ["Z/Permanent/A.md", ["B", "Missing", "A"]],
      ["Z/Permanent/B.md", ["C"]],
      ["Z/Permanent/C.md", []],
      ["Z/Permanent/Orphan.md", []],
    ]),
    basenameResolver(PATHS),
  );

  it("tracks outgoing, incoming and unresolved links, ignoring self-links", () => {
    expect(graph.outlinks("Z/Permanent/A.md")).toEqual(["Z/Permanent/B.md"]);
    expect(graph.backlinks("Z/Permanent/B.md")).toEqual(["Z/Permanent/A.md"]);
    expect(graph.unresolvedLinks("Z/Permanent/A.md")).toEqual(["Missing"]);
  });

  it("walks the neighborhood in both directions with hop distances", () => {
    expect([...graph.neighborhood("Z/Permanent/C.md", 2)]).toEqual([
      ["Z/Permanent/B.md", 1],
      ["Z/Permanent/A.md", 2],
    ]);
  });

  it("detects orphans", () => {
    expect(graph.isOrphan("Z/Permanent/Orphan.md")).toBe(true);
    expect(graph.isOrphan("Z/Permanent/C.md")).toBe(false);
  });
});
