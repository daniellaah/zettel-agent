// Reloads the plugin so a fresh build takes effect, then opens the chat view. Right after
// Obsidian starts, community plugins may still be loading: wait for that first.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (condition, what) => {
  for (let i = 0; i < 100; i++) {
    try {
      if (condition()) return;
    } catch {
      // Obsidian is still starting up; objects appear as it boots.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
await until(() => window.app?.workspace?.layoutReady, "the workspace layout");
await until(() => app.plugins?.plugins?.["zettel-agent"], "the plugin to load");
await app.plugins.disablePlugin("zettel-agent");
await app.plugins.enablePlugin("zettel-agent");
await until(() => app.plugins.plugins["zettel-agent"], "the plugin to reload");
const plugin = app.plugins.plugins["zettel-agent"];
await plugin.vaultCorpus.whenReady();
await app.commands.executeCommandById("zettel-agent:open-chat");
await until(() => document.querySelector(".za-chat"), "the chat view");
return { reloaded: true };
