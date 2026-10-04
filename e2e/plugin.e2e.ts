import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ObsidianPage } from "./cdp";
import { connectToFixtureVault } from "./obsidian";
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
    expect(state.loaded).toBe(true);
    expect(state.notes).toBe(318);
    expect(state.stages).toEqual({ literature: 137, permanent: 181 });
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
    ]);
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
