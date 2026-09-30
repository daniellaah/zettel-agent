import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeFolder, resolveSettings, stageForPath } from "./settings";

const settings = resolveSettings({ zettelkastenRoot: "02-Zettelkasten" });

describe("stageForPath", () => {
  it("derives the stage from the first folder under the root", () => {
    expect(stageForPath("02-Zettelkasten/Permanent/原子性.md", settings)).toBe("permanent");
    expect(stageForPath("02-Zettelkasten/Fleeting/2026/idea.md", settings)).toBe("fleeting");
  });

  it("matches stage folders case-insensitively", () => {
    expect(stageForPath("02-Zettelkasten/literature/book.md", settings)).toBe("literature");
  });

  it("returns null outside the root or outside any stage folder", () => {
    expect(stageForPath("01-Journal/2026-09-30.md", settings)).toBeNull();
    expect(stageForPath("02-Zettelkasten/index.md", settings)).toBeNull();
    expect(stageForPath("02-Zettelkasten/Archive/old.md", settings)).toBeNull();
    expect(stageForPath("02-Zettelkasten-old/Permanent/x.md", settings)).toBeNull();
  });

  it("treats an empty root as the whole vault", () => {
    expect(stageForPath("Writing/draft.md", DEFAULT_SETTINGS)).toBe("writing");
  });
});

describe("resolveSettings", () => {
  it("falls back to defaults for missing or mistyped fields", () => {
    const resolved = resolveSettings({ model: 42, stageFolders: { permanent: " /Zettel/ " } });
    expect(resolved.model).toBe(DEFAULT_SETTINGS.model);
    expect(resolved.stageFolders.permanent).toBe("Zettel");
    expect(resolved.stageFolders.fleeting).toBe("Fleeting");
  });

  it("accepts non-object input", () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("normalizeFolder", () => {
  it("strips whitespace and surrounding slashes", () => {
    expect(normalizeFolder("  /a/b/  ")).toBe("a/b");
  });
});
