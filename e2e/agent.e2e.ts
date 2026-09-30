import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectToFixtureVault } from "./obsidian";
import { writeReport, type ScenarioRecord } from "./report";
import { SCENARIOS } from "./scenarios";
import type { AskResult, PluginState, UiState } from "./types";

/**
 * Live agent runs against real model APIs (this costs money). Providers come from
 * E2E_PROVIDERS (comma-separated), defaulting to the one selected in settings; providers
 * without an API key are skipped.
 *
 * Deterministic behaviour is asserted. Answer quality (which notes get cited) is only
 * recorded in the report, because it varies by model and run.
 */

const page = await connectToFixtureVault();
const state = await page.run<PluginState>("state");
const requested = process.env.E2E_PROVIDERS?.split(",").map((p) => p.trim()) ?? [state.provider];
const providers = requested.filter((provider) => state.keysConfigured[provider]);
const skipped = requested.filter((provider) => !state.keysConfigured[provider]);
if (skipped.length > 0) console.log(`e2e: no API key for ${skipped.join(", ")}; skipping`);

afterAll(() => page.close());

if (providers.length === 0) {
  it.skip("no selected provider has an API key; configure one in the fixture vault's settings", () => {});
}

describe.each(providers)("agent on %s", (provider) => {
  const records: ScenarioRecord[] = [];
  let previousProvider = state.provider;

  beforeAll(async () => {
    previousProvider = (await page.run<{ provider: string }>("set-provider", { provider }))
      .provider;
  });

  afterAll(async () => {
    await page.run("set-provider", { provider: previousProvider });
    if (records.length > 0) console.log(writeReport(provider, state.models[provider]!, records));
  });

  for (const scenario of SCENARIOS) {
    it(`answers: ${scenario.id} (${scenario.what})`, async () => {
      const result = await page.run<AskResult>("ask", {
        question: scenario.question,
        reset: !scenario.followUp,
      });
      records.push({ scenario, result });
      expect(result.error).toBeNull();
      expect(["answered", "budget_exhausted"]).toContain(result.stop);
      expect(result.finalAnswer.trim()).not.toBe("");
      expect(result.tools.length).toBeGreaterThan(0);
    });

    if (scenario.id === "follow-up") {
      // The chat now holds a two-turn conversation with citations: check the UI on it.
      it("renders answers with citation chips, links and actions", async () => {
        const ui = await page.run<UiState>("inspect-ui");
        expect(ui.userMessages).toBe(2);
        expect(ui.assistantMessages).toBe(2);
        expect(ui.runningToolRows).toBe(0);
        expect(ui.citationChips).toBeGreaterThan(0);
        expect(ui.rawCitationsLeft).toBe(0);
        expect(ui.chipTitles.every((title) => title.length > 0)).toBe(true);
        expect(ui.footerButtons.some((label) => label.startsWith("Copy"))).toBe(true);
        expect(ui.usageText).toMatch(/cached/);
      });

      it("opens the cited note when a citation chip is clicked", async () => {
        const click = await page.run<{ expected: string; opened: string } | null>("click-citation");
        expect(click).not.toBeNull();
        expect(click!.opened).toBe(click!.expected);
      });

      it("opens a linked note when an answer link is clicked", async () => {
        const click = await page.run<{ expected: string; opened: string } | null>("click-link");
        if (click === null) return; // This answer happened to contain no resolvable link.
        expect(click.opened).toBe(click.expected);
      });

      it("inserts the answer at the cursor with citations turned into links", async () => {
        const insert = await page.run<Record<string, boolean | number>>("insert-at-cursor");
        expect(insert).toMatchObject({
          keptExistingText: true,
          hasNoteLinks: true,
          hasRawCitations: false,
          tempRemoved: true,
        });
        expect(insert.insertedChars).toBeGreaterThan(0);
      });
    }
  }

  it("continues the conversation after a turn is stopped", async () => {
    for (const stopAfterMs of [1500, 4000]) {
      const result = await page.run<Record<string, unknown>>("stop-continue", {
        first: "详细比较我笔记里所有关于记忆和复习的观点",
        second: "用一句话说说间隔重复是什么",
        stopAfterMs,
      });
      expect(result).toMatchObject({
        firstStop: "aborted",
        secondStop: "answered",
        secondError: null,
      });
      expect(result.secondAnswerChars).toBeGreaterThan(0);
    }
  });

  it("never creates a note when an unresolved link is clicked", async () => {
    await page.run("ask", {
      question:
        "[[卡片盒是对话伙伴而非存档]] 提到的 Folgezettel 编号规则那张笔记存在吗？回答里写出那个链接。",
      reset: true,
    });
    const click = await page.run<{ href: string; created: boolean } | null>(
      "click-unresolved-link",
    );
    if (click === null) return; // The model did not write the unresolved link this time.
    expect(click.created).toBe(false);
  });

  it("reports a wrong model name clearly", async () => {
    const original = state.models[provider];
    await page.run("set-provider", { provider, model: "no-such-model-e2e" });
    try {
      const result = await page.run<AskResult>("ask", { question: "hi", reset: true });
      expect(result.stop).toBe("error");
      expect(result.error).toMatch(/error|recognise|model/i);
      expect(result.error).not.toMatch(/(\d{3}): \1/); // status not repeated
    } finally {
      await page.run("set-provider", { provider, model: original });
    }
  });

  it("starts a new chat", async () => {
    const chat = await page.run<{ items: number; starters: number }>("new-chat");
    expect(chat).toEqual({ items: 0, starters: 3 });
  });
});
