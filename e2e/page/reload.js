// Reloads the plugin so a fresh build takes effect, then opens the chat view.
await app.plugins.disablePlugin("zettel-agent");
await app.plugins.enablePlugin("zettel-agent");
const plugin = app.plugins.plugins["zettel-agent"];
await plugin.vaultCorpus.whenReady();
await app.commands.executeCommandById("zettel-agent:open-chat");
await new Promise((r) => setTimeout(r, 300));
return { reloaded: true, chatOpen: document.querySelector(".za-chat") !== null };
