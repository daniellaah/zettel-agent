import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ObsidianPage } from "./cdp";
import { connectToFixtureVault } from "./obsidian";

let page: ObsidianPage;
beforeAll(async () => {
  page = await connectToFixtureVault();
});
afterAll(() => page?.close());

interface CreationResult {
  path: string;
  content: string;
  stage: string;
  indexed: boolean;
  opened: boolean;
  cursorLine: string;
  precedingLine: string;
  error: string;
  unchanged: boolean;
  createdCount: number;
  sourceLink: string | null;
  sessionUnchanged: boolean;
}

describe("user-triggered fixed-template note creation", () => {
  it.each(["fleeting", "literature", "permanent"])(
    "creates and opens a %s note without invoking the agent",
    async (kind) => {
      const result = await page.run<CreationResult>("create-note", { kind });
      expect(result.path).toMatch(new RegExp(`/${kind}-folder/`));
      expect(result.stage).toBe(kind);
      expect(result.indexed).toBe(kind !== "fleeting");
      expect(result.opened).toBe(true);
      expect(result.cursorLine).toBe("");
      expect(result.sessionUnchanged).toBe(true);
      if (kind === "fleeting") {
        expect(result.content).toContain("tags: [inbox]");
        expect(result.content).not.toContain("##");
      } else if (kind === "literature") {
        expect(result.content).toContain('source_title: "Writing, Learning and Thinking"');
        expect(result.content).toContain('author: "Ahrens"');
        expect(result.content).toContain('year: "2017"');
        expect(result.content).toContain('source: "https://example.com/source"');
        expect(result.content.split("---\n")[2]).toBe("\n# A useful idea\n\n");
      } else {
        expect(result.content).toContain("source: []");
        expect(result.content.split("---\n")[2]).toBe("\n# A useful idea\n\n");
        expect(result.content).not.toContain("tags:");
        expect(result.content).not.toContain("aliases:");
      }
    },
  );

  it("only links the open note when the user selects it as a source", async () => {
    const result = await page.run<CreationResult>("create-note", {
      kind: "permanent",
      useSource: true,
    });
    expect(result.sourceLink).not.toBeNull();
    expect(result.content).toContain(`source:\n  - ${JSON.stringify(result.sourceLink)}`);
    expect(result.content.split("---\n")[2]).toBe("\n# A useful idea\n\n");
  });

  it("cancels without creating files or stage folders", async () => {
    const result = await page.run<CreationResult>("create-note", {
      kind: "fleeting",
      action: "cancel",
    });
    expect(result.unchanged).toBe(true);
    expect(result.createdCount).toBe(0);
  });

  it("refuses duplicate names without overwriting the existing note", async () => {
    const result = await page.run<CreationResult>("create-note", {
      kind: "fleeting",
      action: "duplicate",
    });
    expect(result.error).toMatch(/already exists/);
    expect(result.unchanged).toBe(true);
    expect(result.createdCount).toBe(1);
  });

  it("rejects a title that escapes the destination folder", async () => {
    const result = await page.run<CreationResult>("create-note", {
      kind: "fleeting",
      action: "invalid",
    });
    expect(result.error).toMatch(/title/);
    expect(result.unchanged).toBe(true);
    expect(result.createdCount).toBe(0);
  });

  it("reports a file blocking a destination folder and keeps its contents", async () => {
    const result = await page.run<CreationResult>("create-note", {
      kind: "fleeting",
      action: "blocked",
    });
    expect(result.error).toMatch(/destination folder/);
    expect(result.unchanged).toBe(true);
    expect(result.createdCount).toBe(0);
  });
});
