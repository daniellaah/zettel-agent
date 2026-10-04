// Clicks the first answer link that resolves and reports which note opened.
const links = [...document.querySelectorAll(".za-chat a.internal-link:not(.is-unresolved)")];
const link = links.find((a) => app.metadataCache.getFirstLinkpathDest((a.dataset.href ?? "").split("#")[0], ""));
if (!link) return null;
const expected = app.metadataCache.getFirstLinkpathDest(link.dataset.href.split("#")[0], "").path;
link.click();
await new Promise((r) => setTimeout(r, 800));
return { expected, opened: app.workspace.getActiveFile()?.path ?? null };
