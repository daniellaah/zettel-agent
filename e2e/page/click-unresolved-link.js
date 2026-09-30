// Clicks a faded (unresolved) link, if the last answer has one; no note may be created.
const link = document.querySelector(".za-chat a.internal-link.is-unresolved");
if (!link) return null;
const before = app.vault.getFiles().length;
link.click();
await new Promise((r) => setTimeout(r, 800));
return { href: link.dataset.href, created: app.vault.getFiles().length !== before };
