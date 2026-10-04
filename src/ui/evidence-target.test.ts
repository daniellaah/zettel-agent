import { expect, it } from "vitest";
import { evidenceTarget } from "./evidence-target";

const evidence = {
  id: "E1",
  path: "Z/A/Same.md",
  sectionId: "s",
  headingPath: ["Same", "Detail"],
  contentHash: "old",
};
it("opens the exact original path and heading, regardless of duplicate titles", () => {
  expect(evidenceTarget(evidence, "old")).toEqual({
    path: "Z/A/Same.md",
    subpath: "#Detail",
    notice: null,
  });
});
it("refuses deleted, renamed, inaccessible and unknown evidence", () => {
  expect(evidenceTarget(evidence, undefined)).toContain("moved or deleted");
  expect(evidenceTarget(undefined, "old")).toContain("does not match");
});
it("discloses stale content and avoids a now-invalid heading", () => {
  expect(evidenceTarget(evidence, "new")).toMatchObject({
    path: evidence.path,
    subpath: "",
    notice: "This note has changed since it was cited. Opening its current content.",
  });
});
