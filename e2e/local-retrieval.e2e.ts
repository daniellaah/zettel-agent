import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

/** Real Obsidian + real local embeddings, with a scripted answer provider: no cloud calls. */
it.runIf(process.env.E2E_LOCAL_EMBEDDINGS === "1")(
  "builds local embeddings and uses hybrid search through the chat session",
  async () => {
    const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "zettel-ollama-e2e-"));
    const page = await connectToFixtureVault();
    try {
      const result = await page.evaluate<Record<string, unknown>>(
        `
      const plugin = app.plugins.plugins["zettel-agent"];
      const host = plugin.localEmbeddings;
      const saved = { mode: plugin.settings.retrievalMode, replay: plugin.settings.recordingMode, endpoint: plugin.settings.ollamaEndpoint, cache: host.options.cacheRoot, provider: plugin.session.deps.provider };
      const namesBefore = app.vault.getMarkdownFiles().map(f => f.path).sort();
      try {
        plugin.settings.retrievalMode = "hybrid";
        plugin.settings.recordingMode = "off";
        plugin.settings.ollamaEndpoint = "http://127.0.0.1:11434";
        host.options.cacheRoot = args.cacheRoot;
        await host.rebuild();
        const first = host.status;
        const corpus = plugin.vaultCorpus.current;
        const prepared = await host.search(corpus, "如何融合关键词检索和语义搜索的结果？", { limit: 8 });
        await host.rebuild();
        const warm = host.status;
        let step = 0;
        let toolMode = null;
        plugin.session.deps.provider = () => Promise.resolve({
          provider: "scripted", model: "local-e2e", describeError: e => String(e),
          send: (request, handlers) => {
            let parts;
            if (step++ === 0) parts = [{ type: "tool_call", id: "local-search", name: "search", input: { query: "如何融合关键词检索和语义搜索的结果？", limit: 8 } }];
            else {
              toolMode = request.messages.flatMap(m => m.parts).find(p => p.type === "tool_result")?.contract?.effective?.mode;
              parts = [{ type: "text", text: "Fixture evidence [E1]." }]; handlers.onText(parts[0].text);
            }
            return Promise.resolve({ message: { role: "assistant", parts }, finish: step === 1 ? "tool_calls" : "end", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } });
          }
        });
        plugin.session.reset();
        await plugin.session.send("Local embedding integration test");
        const answer = plugin.session.getSnapshot().items.at(-1);
        plugin.settings.recordingMode = "replay";
        const replay = await host.search(corpus, "RRF", {});
        plugin.settings.recordingMode = "off";
        plugin.settings.ollamaEndpoint = "http://127.0.0.1:1";
        await host.rebuild();
        const unavailable = await host.search(corpus, "RRF", {});
        app.setting.open(); app.setting.openTabById("zettel-agent");
        const names = [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item-name")].map(n => n.textContent);
        app.setting.close();
        return { first, warm, mode: prepared.mode, toolMode, paths: prepared.hits.length, answerStop: answer.stop, citations: answer.citations, replayMode: replay.mode, unavailableMode: unavailable.mode, fallback: !!unavailable.fallback, settingsVisible: names.includes("Search mode") && names.includes("Local index"), filesUnchanged: JSON.stringify(namesBefore) === JSON.stringify(app.vault.getMarkdownFiles().map(f => f.path).sort()) };
      } finally {
        plugin.settings.retrievalMode = saved.mode;
        plugin.settings.recordingMode = saved.replay;
        plugin.settings.ollamaEndpoint = saved.endpoint;
        if (saved.cache === undefined) delete host.options.cacheRoot; else host.options.cacheRoot = saved.cache;
        plugin.session.deps.provider = saved.provider;
        plugin.session.reset();
        host.schedule();
      }
    `,
        { cacheRoot },
      );
      expect(result).toMatchObject({
        mode: "hybrid",
        toolMode: "hybrid",
        answerStop: "answered",
        citations: { valid: ["E1"], unknown: [] },
        replayMode: "lexical",
        unavailableMode: "lexical",
        fallback: true,
        settingsVisible: true,
        filesUnchanged: true,
      });
      expect(result.first).toContain("318 encoded locally");
      expect(result.warm).toContain("318 cached, 0 encoded");
      expect(Number(result.paths)).toBeGreaterThan(0);
      console.log(JSON.stringify(result));
    } finally {
      page.close();
      await rm(cacheRoot, { recursive: true, force: true });
    }
  },
);
