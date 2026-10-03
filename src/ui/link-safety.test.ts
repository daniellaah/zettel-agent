import { expect, it } from "vitest";
import { safeExternalLink } from "./link-safety";
it("allows web sources and rejects app commands, scripts and local files", () => {
  expect(safeExternalLink("https://example.org/source?q=x")).toBe(true);
  expect(safeExternalLink("http://localhost:3000")).toBe(true);
  for (const href of [
    "obsidian://new?file=Created",
    "javascript:alert(1)",
    "file:///tmp/a",
    "data:text/html,x",
    "relative",
    "mailto:a@b",
  ])
    expect(safeExternalLink(href)).toBe(false);
});
