// Inserts the last answer into a temporary note, reads it back, then trashes the note.
const name = "zettel-agent-e2e-insert.md";
const existing = app.vault.getAbstractFileByPath(name);
if (existing) await app.vault.trash(existing, true);
const temp = await app.vault.create(name, "BEFORE\n");
const leaf = app.workspace.getLeaf(false);
await leaf.openFile(temp);
leaf.view.editor.setCursor({ line: 1, ch: 0 });
document.querySelector('.za-chat .za-message-footer button[aria-label^="Insert"]').click();
await new Promise((r) => setTimeout(r, 500));
const text = leaf.view.editor.getValue();
leaf.detach();
await app.vault.trash(temp, true);
return {
  keptExistingText: text.startsWith("BEFORE\n"),
  insertedChars: text.length - "BEFORE\n".length,
  hasNoteLinks: /\[\[[^\]]+\]\]/.test(text),
  hasRawCitations: /\[E\d+/.test(text),
  tempRemoved: app.vault.getAbstractFileByPath(name) === null,
};
