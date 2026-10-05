import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ObsidianPage } from "./cdp";
import { connectToFixtureVault } from "./obsidian";
import { fixtureNoteCounts } from "./fixture-counts";
import type { AskResult, PluginState, UiState } from "./types";

/** Checks that need no model calls: loading, indexing, settings, empty chat, setup errors. */

let page: ObsidianPage;
let state: PluginState;

beforeAll(async () => {
  page = await connectToFixtureVault();
  state = await page.run<PluginState>("state");
});

afterAll(() => page?.close());

describe("plugin in Obsidian", () => {
  it("loads and indexes the fixture Zettelkasten by stage", () => {
    const expected = fixtureNoteCounts();
    expect(state.loaded).toBe(true);
    expect(state.notes).toBe(expected.notes);
    expect(state.stages).toEqual(expected.stages);
  });

  it("renders the settings tab for the selected provider", async () => {
    const settings = await page.run<{ names: string[]; providers: string[] }>("settings-tab");
    expect(settings.providers).toEqual(["anthropic", "openai", "deepseek"]);
    expect(settings.names).toEqual([
      "Model",
      "Provider",
      "API key",
      "Model",
      "Notes",
      "Zettelkasten folder",
      "Stage folders",
      "Fleeting",
      "Literature",
      "Permanent",
      "Writing",
      "Semantic search",
      "Search by meaning",
      "Ollama address",
      "Embedding model",
      "Index",
    ]);
  });

  it("indexes notes by meaning with the local Ollama, or says why it cannot", async () => {
    const semantic = await page.run<{
      status: { state: string; message?: string; total?: number } | null;
      statusText: string | null;
      fusion: unknown;
      hits: { path: string; semanticRank: number | null }[];
    }>("semantic");
    if (semantic.status?.state === "unavailable") {
      // No Ollama on this machine: search must say it uses keywords only.
      expect(semantic.statusText).toContain("keywords only");
      return;
    }
    expect(semantic.status?.state).toBe("ready");
    expect(semantic.status?.total).toBeGreaterThan(0);
    expect(semantic.statusText).toMatch(/^Ready: \d+ sections embedded/);
    expect(semantic.fusion).toEqual({ method: "convex", alpha: 0.4 });
    expect(semantic.hits.length).toBeGreaterThan(0);
    expect(semantic.hits.some((hit) => hit.semanticRank !== null)).toBe(true);
  });

  it("opens an empty chat with starter questions", async () => {
    await page.run("new-chat");
    const ui = await page.run<UiState>("inspect-ui");
    expect(ui.starters).toBe(3);
    expect(ui.composerButton).toBe("Send");
    expect(ui.headerModel).toBe(state.models[state.provider]);
  });

  it("explains a missing API key instead of calling the model", async () => {
    const missing = Object.entries(state.keysConfigured).find(([, configured]) => !configured);
    if (!missing) return; // Every provider has a key; nothing to check.
    const previous = await page.run<{ provider: string }>("set-provider", { provider: missing[0] });
    try {
      const result = await page.run<AskResult>("ask", { question: "hi", reset: true });
      expect(result.stop).toBe("error");
      expect(result.error).toMatch(/API key/);
      expect(result.usage).toBeNull();
    } finally {
      await page.run("set-provider", { provider: previous.provider });
      await page.run("new-chat");
    }
  });
});
