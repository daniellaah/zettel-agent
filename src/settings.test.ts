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
    const resolved = resolveSettings({
      provider: "nope",
      models: { openai: 42 },
      stageFolders: { permanent: " /Zettel/ " },
    });
    expect(resolved.provider).toBe("anthropic");
    expect(resolved.models.openai).toBe(DEFAULT_SETTINGS.models.openai);
    expect(resolved.stageFolders.permanent).toBe("Zettel");
    expect(resolved.stageFolders.fleeting).toBe("Fleeting");
  });

  it("migrates the single-provider v0.1 settings", () => {
    const resolved = resolveSettings({
      apiKeySecretId: "anthropic-key",
      model: "claude-sonnet-5-5",
    });
    expect(resolved.apiKeySecretIds.anthropic).toBe("anthropic-key");
    expect(resolved.models.anthropic).toBe("claude-sonnet-5-5");
    expect(resolved.models.deepseek).toBe("deepseek-flash");
  });

  it("keeps a model and key per provider", () => {
    const resolved = resolveSettings({
      provider: "deepseek",
      models: { deepseek: "deepseek-v4-pro" },
      apiKeySecretIds: { deepseek: "ds" },
    });
    expect(resolved.provider).toBe("deepseek");
    expect(resolved.models.deepseek).toBe("deepseek-v4-pro");
    expect(resolved.apiKeySecretIds).toEqual({ anthropic: "", openai: "", deepseek: "ds" });
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
