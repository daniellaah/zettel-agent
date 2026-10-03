import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

it("opens exact citations safely across duplicate, changed, renamed and deleted targets", async () => {
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"];
      const session = plugin.session;
      const saved = { provider: session.deps.provider, store: session.deps.store, review: plugin.settings.answerReviewMode };
      const folder = [plugin.settings.zettelkastenRoot, plugin.settings.stageFolders.permanent, "release-safety-" + Date.now()].filter(Boolean).join("/");
      const before = app.vault.getMarkdownFiles().map(f => f.path).sort();
      try {
        await app.vault.createFolder(folder + "/A"); await app.vault.createFolder(folder + "/B");
        const original = await app.vault.create(folder + "/A/Same.md", "# Same\n\n## Detail\n\nOriginal fixture evidence.");
        await app.vault.create(folder + "/B/Same.md", "# Same\n\nDifferent duplicate.");
        plugin.vaultCorpus.current.upsert(original.path, await app.vault.read(original));
        let step = 0;
        session.deps.provider = async () => ({ provider: "scripted", model: "safe-open", describeError: () => "Fixture failure", send: async (request, handlers) => {
          const parts = step++ === 0 ? [{ type: "tool_call", id: "read", name: "read", input: { target: original.path } }] : [{ type: "text", text: "Fixture answer [E1]. [[Missing release note]]" }];
          for (const p of parts) if (p.type === "text") handlers.onText(p.text);
          return { message: { role: "assistant", parts }, finish: step === 1 ? "tool_calls" : "end", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
        } });
        session.deps.store = { save: async () => {} }; plugin.settings.answerReviewMode = "structural";
        await plugin.activateChatView(); session.reset(); await session.send("Read the release fixture.");
        await new Promise(r => setTimeout(r, 250));
        const view = app.workspace.getLeavesOfType("zettel-agent-chat")[0].view;
        const host = view.createHost();
        let copied = "";
        const writeClipboard = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async text => { copied = text; };
        try { document.querySelector('button[aria-label^="Copy answer"]').click(); await new Promise(r => setTimeout(r, 50)); }
        finally { navigator.clipboard.writeText = writeClipboard; }
        const copy = copied.includes("[[" + original.path.replace(/\.md$/, "")) && !copied.includes("[E1]");
        const insertion = await app.vault.create(folder + "/Insert.md", "BEFORE\n");
        const editorLeaf = app.workspace.getLeaf(false); await editorLeaf.openFile(insertion);
        editorLeaf.view.editor.setCursor({ line: 1, ch: 0 });
        document.querySelector('button[aria-label^="Insert answer"]').click(); await new Promise(r => setTimeout(r, 80));
        const inserted = editorLeaf.view.editor.getValue(); await editorLeaf.view.save();
        const insert = inserted.startsWith("BEFORE\n") && inserted.includes("[[") && !inserted.includes("[E1]");
        document.querySelector(".za-cite").click(); await new Promise(r => setTimeout(r, 100));
        const exact = app.workspace.getMostRecentLeaf()?.view?.file?.path === original.path;
        await app.vault.modify(original, "# Same\n\nChanged fixture body.");
        plugin.vaultCorpus.current.upsert(original.path, await app.vault.read(original));
        host.openEvidence("E1", false); await new Promise(r => setTimeout(r, 100));
        const staleNotice = [...document.querySelectorAll(".notice")].some(n => n.textContent.includes("changed since"));
        const count = app.vault.getMarkdownFiles().length;
        await app.vault.rename(original, folder + "/A/Renamed.md");
        plugin.vaultCorpus.current.remove(folder + "/A/Same.md");
        host.openEvidence("E1", false); host.openLink("Missing release note", false);
        await new Promise(r => setTimeout(r, 100));
        const renamedSafe = app.vault.getMarkdownFiles().length === count && !app.vault.getAbstractFileByPath(folder + "/A/Same.md");
        await app.vault.delete(original);
        host.openEvidence("E1", false); await new Promise(r => setTimeout(r, 100));
        const deletedSafe = app.vault.getMarkdownFiles().length === count - 1;
        return { exact, copy, insert, staleNotice, renamedSafe, deletedSafe, unknown: host.describeEvidence("E999") === null };
      } finally {
        session.stop(); session.deps.provider = saved.provider; session.deps.store = saved.store; plugin.settings.answerReviewMode = saved.review; session.reset();
        const temp = app.vault.getAbstractFileByPath(folder); if (temp) await app.vault.delete(temp, true);
        await plugin.vaultCorpus.rebuild();
        if (JSON.stringify(before) !== JSON.stringify(app.vault.getMarkdownFiles().map(f => f.path).sort())) throw new Error("Fixture filenames were not restored.");
      }
    `);
    expect(result).toEqual({
      exact: true,
      copy: true,
      insert: true,
      staleNotice: true,
      renamedSafe: true,
      deletedSafe: true,
      unknown: true,
    });
  } finally {
    page.close();
  }
});

it("recovers initialization/cancellation/reset/load/close and deterministic setup failures", async () => {
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], session = plugin.session;
      const saved = { provider: session.deps.provider, corpus: session.deps.corpus, store: session.deps.store, review: plugin.settings.answerReviewMode, root: plugin.settings.zettelkastenRoot };
      const make = text => ({ provider: "scripted", model: "lifecycle", describeError: () => "Scripted network error", send: async (request, handlers) => { handlers.onText(text); return { message: { role: "assistant", parts: [{ type: "text", text }] }, finish: "end", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }; } });
      try {
        session.deps.store = { save: async () => {} }; plugin.settings.answerReviewMode = "structural";
        session.reset(); session.deps.provider = async () => { throw new Error("Do not display raw failure"); };
        await session.send("Initialization failure");
        const failed = !session.getSnapshot().running && session.getSnapshot().items.at(-1).error.includes("initialize");
        let release; session.deps.provider = () => new Promise(r => { release = r; });
        const old = session.send("Delayed old turn"); session.stop();
        const stopped = session.getSnapshot().items.at(-1).stop === "aborted";
        session.reset(); session.deps.provider = async () => make("New fixture answer");
        await session.send("New turn"); release(make("OLD CONTAMINATION")); await old;
        const isolated = session.answerMarkdown(session.getSnapshot().items.at(-1)) === "New fixture answer";
        const record = session.toRecord(); session.deps.provider = () => new Promise(r => { release = r; });
        const loading = session.send("Old turn before history load"); session.load(record); release(make("OLD LOAD")); await loading;
        const loaded = session.getSnapshot().items.length === record.items.length;
        const closing = session.send("Close during initialization");
        await app.workspace.getLeavesOfType("zettel-agent-chat")[0].detach();
        release(make("OLD CLOSE")); await closing;
        const closed = !session.getSnapshot().running;
        await plugin.activateChatView();
        session.deps.provider = saved.provider;
        const ids = plugin.settings.apiKeySecretIds; plugin.settings.apiKeySecretIds = { anthropic: "", openai: "", deepseek: "" };
        session.reset(); await session.send("No key");
        const noKey = session.getSnapshot().items.at(-1).error.includes("API key"); plugin.settings.apiKeySecretIds = ids;
        plugin.settings.zettelkastenRoot = "release-empty-does-not-exist"; await plugin.vaultCorpus.rebuild();
        session.deps.provider = async () => make("Must not dispatch"); session.reset(); await session.send("Empty folder");
        const empty = session.getSnapshot().items.at(-1).error.includes("No research notes");
        return { failed, stopped, isolated, loaded, closed, noKey, empty };
      } finally {
        session.stop(); session.deps.provider = saved.provider; session.deps.corpus = saved.corpus; session.deps.store = saved.store; plugin.settings.answerReviewMode = saved.review; plugin.settings.zettelkastenRoot = saved.root;
        await plugin.vaultCorpus.rebuild(); session.reset(); await plugin.activateChatView();
      }
    `);
    expect(result).toEqual({
      failed: true,
      stopped: true,
      isolated: true,
      loaded: true,
      closed: true,
      noKey: true,
      empty: true,
    });
  } finally {
    page.close();
  }
});

it("uses the real adapter to recover history and isolate bad records without network", async () => {
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], dir = plugin.manifest.dir + "/release-store-" + Date.now();
      const Store = plugin.conversations.constructor, store = new Store(app, dir);
      const record = { version: 1, id: "fixture", title: "Fixture chat", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T01:00:00Z", items: [], history: [], evidence: [] };
      try {
        await store.save(record);
        await Promise.all([store.save({ ...record, title: "First" }), store.save({ ...record, title: "Last", updatedAt: "2026-10-02T02:00:00Z" })]);
        await app.vault.adapter.write(dir + "/broken.json", "{invalid");
        const list = await store.list(), loaded = await store.load("fixture");
        await app.vault.adapter.write(dir + "/fixture.json.pending", JSON.stringify({ ...record, title: "Recovered", updatedAt: "2026-10-02T03:00:00Z" }));
        const recovered = await store.load("fixture");
        await store.delete("fixture");
        let refused = false; try { await store.save(record); } catch { refused = true; }
        return { single: list.length === 1, newest: loaded.title === "Last", recovered: recovered.title === "Recovered", deleted: (await store.list()).length === 0, refused, badRetained: await app.vault.adapter.exists(dir + "/broken.json") };
      } finally { await app.vault.adapter.rmdir(dir, true); }
    `);
    expect(result).toEqual({
      single: true,
      newest: true,
      recovered: true,
      deleted: true,
      refused: true,
      badRetained: true,
    });
  } finally {
    page.close();
  }
});
