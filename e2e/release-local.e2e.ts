import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { connectToFixtureVault } from "./obsidian";

/** Existing runtime/cache only. Never installs/pulls a model or rebuilds into a fresh cache. */
it("reuses existing local embeddings when available and discloses unavailable-service fallback", async () => {
  let installed = false;
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    const tags = (await response.json()) as { models: { name: string }[] };
    installed = tags.models.some((model) => model.name === "qwen3-embedding:0.6b");
  } catch {
    /* Missing service is covered by the disclosed fallback gate. */
  }
  const page = await connectToFixtureVault();
  try {
    const result = await page.evaluate<Record<string, unknown>>(
      String.raw`
      const plugin = app.plugins.plugins["zettel-agent"], host = plugin.localEmbeddings, saved = structuredClone(plugin.settings);
      try {
        plugin.settings.recordingMode = "off"; plugin.settings.retrievalMode = "lexical";
        const corpus = plugin.vaultCorpus.current, lexical = await host.search(corpus, "QLoRA", {});
        const installed = args.installed;
        let local = null;
        if (installed) {
          plugin.settings.retrievalMode = "hybrid"; plugin.settings.ollamaEndpoint = "http://127.0.0.1:11434";
          await host.rebuild(); const firstStatus = host.status;
          const search = await host.search(corpus, "如何融合关键词检索与语义检索？", { limit: 5 });
          await host.rebuild();
          local = { firstStatus, warmStatus: host.status, mode: search.mode, results: search.hits.length, fallback: search.fallback ?? null };
        }
        plugin.settings.retrievalMode = "hybrid"; plugin.settings.ollamaEndpoint = "http://127.0.0.1:1";
        await host.rebuild(); const unavailable = await host.search(corpus, "QLoRA", {});
        return { installed, lexical: lexical.mode, local, unavailable: unavailable.mode, disclosed: !!unavailable.fallback, status: host.status, version: plugin.hostApiVersion };
      } finally { plugin.settings = saved; host.schedule(); }
    `,
      { installed },
    );
    await writeFile("artifacts/release-prep/local-cache-ui.json", JSON.stringify(result, null, 2));
    expect(result.lexical).toBe("lexical");
    expect(result.unavailable).toBe("lexical");
    expect(result.disclosed).toBe(true);
    if (result.installed) expect((result.local as { mode: string }).mode).toBe("hybrid");
  } finally {
    page.close();
  }
});
