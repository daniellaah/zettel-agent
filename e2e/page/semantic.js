// Waits for the semantic index, then runs one hybrid search inside Obsidian. Reads only.
const plugin = app.plugins.plugins["zettel-agent"];
const started = Date.now();
while (plugin.semantic?.status?.state !== "ready" && Date.now() - started < 120_000) {
  if (plugin.semantic?.status?.state === "unavailable") break;
  await new Promise((r) => setTimeout(r, 500));
}
const status = plugin.semantic?.status ?? null;
const query = "做交叉验证之前，应该先在全部样本上拟合一次标准化的统计量吗？";
const semantic = await plugin.semantic?.queryVectors([query]);
const corpus = plugin.vaultCorpus.current;
const hits = semantic
  ? corpus.search(query, {
      hybrid: { queryVector: semantic.vectors.get(query), fusion: semantic.fusion },
      limit: 10,
    })
  : [];
app.setting.open();
app.setting.openTabById("zettel-agent");
await new Promise((r) => setTimeout(r, 400));
const items = [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")];
const index = items.find((item) => item.querySelector(".setting-item-name")?.textContent === "Index");
const statusText = index?.querySelector(".setting-item-description")?.textContent ?? null;
app.setting.close();
return {
  status,
  statusText,
  fusion: semantic?.fusion ?? null,
  hits: hits.map((hit) => ({ path: hit.path, semanticRank: hit.semanticRank })),
};
