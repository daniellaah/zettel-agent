// Clicks the first citation chip and reports which note opened.
const session = app.plugins.plugins["zettel-agent"].session;
const chip = document.querySelector(".za-chat .za-cite:not(.za-cite-unknown)");
if (!chip) return null;
const expected = session.evidence(chip.dataset.id).path;
chip.click();
await new Promise((r) => setTimeout(r, 800));
return { expected, opened: app.workspace.getActiveFile()?.path ?? null };
