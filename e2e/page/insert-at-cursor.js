// Inserts the last answer into a temporary note, reads it back, then moves the note to the
// fixture vault's own .trash/ folder (git-ignored).
const name = "zettel-agent-e2e-insert.md";
const existing = app.vault.getAbstractFileByPath(name);
if (existing) await app.vault.trash(existing, false);
const temp = await app.vault.create(name, "BEFORE\n");
const leaf = app.workspace.getLeaf(false);
await leaf.openFile(temp);
leaf.view.editor.setCursor({ line: 1, ch: 0 });
document.querySelector('.za-chat .za-message-footer button[aria-label^="Insert"]').click();
await new Promise((r) => setTimeout(r, 500));
const text = leaf.view.editor.getValue();
// Save and close first: a closing editor saves asynchronously and would re-create the file.
await leaf.view.save();
leaf.detach();
await new Promise((r) => setTimeout(r, 500));
await app.vault.trash(temp, false);
await new Promise((r) => setTimeout(r, 1000));
return {
  keptExistingText: text.startsWith("BEFORE\n"),
  insertedChars: text.length - "BEFORE\n".length,
  hasNoteLinks: /\[\[[^\]]+\]\]/.test(text),
  // Well-formed citations (same pattern as CITATION in src/agent/evidence.ts) must become
  // links; malformed ones the model wrote, like "[E3, some title]", are left as text.
  hasRawCitations: /\[(E\d+(?:[^[\]\nE]{1,6}E\d+)*)\]/.test(text),
  tempRemoved: !(await app.vault.adapter.exists(name)),
};
