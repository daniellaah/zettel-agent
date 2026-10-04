import { describe, expect, it } from "vitest";

import { reciprocalRankFusion } from "./fusion";

const s = (path: string, sectionId = "s") => ({ path, sectionId });

describe("reciprocalRankFusion", () => {
  it("adds 1/(k + rank) from each list and records each list's rank", () => {
    const fused = reciprocalRankFusion(
      [
        [s("a"), s("b")],
        [s("b"), s("c")],
      ],
      60,
    );
    expect(fused.map((f) => f.path)).toEqual(["b", "a", "c"]);
    expect(fused[0]).toEqual({ path: "b", sectionId: "s", score: 1 / 62 + 1 / 61, ranks: [2, 1] });
    expect(fused[1]!.ranks).toEqual([1, null]);
    expect(fused[2]!.ranks).toEqual([null, 2]);
  });

  it("breaks ties by best single rank, then path", () => {
    const fused = reciprocalRankFusion([[s("z"), s("y")], [s("x")]]);
    // z and x both score 1/61; y scores 1/62.
    expect(fused.map((f) => f.path)).toEqual(["x", "z", "y"]);
  });

  it("keeps sections of one note apart and ignores repeats within a list", () => {
    const fused = reciprocalRankFusion([[s("a", "1"), s("a", "2"), s("a", "1")]]);
    expect(fused.map((f) => [f.sectionId, f.ranks])).toEqual([
      ["1", [1]],
      ["2", [2]],
    ]);
  });
});
