// A conversation survives a plugin reload and reopens from the history panel.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let plugin = app.plugins.plugins["zettel-agent"];
plugin.session.reset();
await plugin.session.send(args.question);
const before = plugin.session.getSnapshot();
const id = before.conversationId;
const beforeItems = before.items.length;
const beforeText = before.items.at(-1).parts.filter((p) => p.kind === "text").map((p) => p.text).join("");

// Reload the plugin: the in-memory chat is gone, as after restarting Obsidian. Keep the
// provider and model the test run selected in memory.
const { provider, models } = plugin.settings;
const model = models[provider];
await app.plugins.disablePlugin("zettel-agent");
await app.plugins.enablePlugin("zettel-agent");
for (let i = 0; i < 100 && !app.plugins.plugins["zettel-agent"]; i++) await wait(100);
plugin = app.plugins.plugins["zettel-agent"];
plugin.settings.provider = provider;
plugin.settings.models[provider] = model;
await plugin.vaultCorpus.whenReady();
await app.commands.executeCommandById("zettel-agent:open-chat");
await wait(500);
const root = document.querySelector(".za-chat");
const emptyAfterReload = plugin.session.getSnapshot().items.length === 0;

root.querySelector('.za-header button[aria-label="Chat history"]').click();
await wait(500);
const listed = [...root.querySelectorAll(".za-history-title")].map((t) => t.textContent);
root.querySelector(".za-history-list li .za-history-open").click();
await wait(800);
const restored = plugin.session.getSnapshot();
const chipsAfterRestore = root.querySelectorAll(".za-cite").length;

await plugin.session.send(args.followUp);
const after = plugin.session.getSnapshot().items.at(-1);
return {
  sameId: restored.conversationId === id,
  emptyAfterReload,
  listedFirst: listed[0] ?? null,
  restoredItems: restored.items.length,
  beforeItems,
  sameText:
    restored.items[beforeItems - 1].parts.filter((p) => p.kind === "text").map((p) => p.text).join("") === beforeText,
  chipsAfterRestore,
  followUpStop: after.stop,
  followUpError: after.error,
  itemsAfterFollowUp: plugin.session.getSnapshot().items.length,
};
