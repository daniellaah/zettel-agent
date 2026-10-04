// Clicks the first citation chip and reports which note opened.
const session = app.plugins.plugins["zettel-agent"].session;
const chip = document.querySelector(".za-chat .za-cite:not(.za-cite-unknown)");
if (!chip) return null;
const id = [...chip.classList].map((c) => /^za-cite-(E\d+)$/.exec(c)?.[1]).find(Boolean);
const expected = session.evidence(id).path;
chip.click();
await new Promise((r) => setTimeout(r, 800));
return { expected, opened: app.workspace.getActiveFile()?.path ?? null };
