import { expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import { TFile, type App, type Plugin } from "obsidian";
import { VaultCorpus } from "./vault-corpus";
import { resolveSettings } from "../settings";

it("notifies local index maintenance only when research contents actually change", async () => {
  let content = "# Research\nInitial content.";
  const note = Object.assign(new TFile(), { path: "Z/Permanent/One.md", extension: "md" });
  const unrelated = Object.assign(new TFile(), { path: "Journal/Today.md", extension: "md" });
  const events = new Map<string, (...args: unknown[]) => void>();
  const app = {
    vault: {
      getMarkdownFiles: () => [note, unrelated],
      cachedRead: () => Promise.resolve(content),
      getAbstractFileByPath: (path: string) => (path === note.path ? note : unrelated),
      on: (event: string, callback: (...args: unknown[]) => void) => {
        events.set(event, callback);
      },
    },
    metadataCache: { getFirstLinkpathDest: () => null },
  } as unknown as App;
  const changed = vi.fn();
  const corpus = new VaultCorpus(app, () => resolveSettings({ zettelkastenRoot: "Z" }), changed);
  corpus.registerEvents({ registerEvent: () => {} } as unknown as Plugin);
  await corpus.rebuild();
  expect(changed).toHaveBeenCalledTimes(1);
  events.get("modify")!(unrelated);
  events.get("modify")!(note);
  // update's read completes on the microtask queue.
  await Promise.resolve();
  await Promise.resolve();
  expect(changed).toHaveBeenCalledTimes(1);
  content = "# Research\nRevised content.";
  events.get("modify")!(note);
  await Promise.resolve();
  await Promise.resolve();
  expect(changed).toHaveBeenCalledTimes(2);
  events.get("delete")!(unrelated);
  expect(changed).toHaveBeenCalledTimes(2);
  events.get("delete")!(note);
  expect(changed).toHaveBeenCalledTimes(3);
});
