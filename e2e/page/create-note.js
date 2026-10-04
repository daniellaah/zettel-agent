// Only run by connectToFixtureVault. Each case owns a fresh temporary folder and
// restores settings in memory; it never touches the existing fixture notes.
const plugin = app.plugins.plugins["zettel-agent"];
const originalRoot = plugin.settings.zettelkastenRoot;
const originalFolders = plugin.settings.stageFolders;
const scratch = `__zettel-creation-e2e-${crypto.randomUUID()}`;
if (app.vault.getAbstractFileByPath(scratch)) throw new Error("Scratch folder already exists");
const kind = args.kind;
const action = args.action ?? "create";
const title = "A useful idea";
const target = `${scratch}/${kind}-folder/${title}.md`;
const beforeSession = plugin.session.getSnapshot();
let sourceLink = null;

const waitFor = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for note creation UI");
};
const fill = (label, value) => {
  const input = document.querySelector(`.za-create-note input[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing input: ${label}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const open = async () => {
  app.commands.executeCommandById(`zettel-agent:create-${kind}-note`);
  await waitFor(() => document.querySelector(".za-create-note"));
  fill("Title", action === "invalid" ? "../outside" : title);
};

try {
  plugin.settings.zettelkastenRoot = scratch;
  plugin.settings.stageFolders = { ...originalFolders, [kind]: `${kind}-folder` };
  await plugin.vaultCorpus.rebuild();
  if (args.useSource || kind === "permanent") {
    await app.vault.createFolder(scratch);
    const source = await app.vault.create(`${scratch}/Source.md`, "# Source\n\nAn idea to think about.\n");
    sourceLink = `[[${scratch}/Source]]`;
    await app.workspace.getLeaf(false).openFile(source, { state: { mode: "source" } });
  }
  if (action === "blocked") {
    await app.vault.createFolder(scratch);
    await app.vault.create(`${scratch}/${kind}-folder`, "Do not overwrite this file.");
  }
  const before = app.vault.getAllLoadedFiles().map((file) => file.path).sort();
  await open();
  if (action === "cancel") {
    document.querySelector('.za-create-note [aria-label="Cancel note creation"]').click();
    await waitFor(() => !document.querySelector(".za-create-note"));
    return { unchanged: JSON.stringify(before) === JSON.stringify(app.vault.getAllLoadedFiles().map((file) => file.path).sort()), createdCount: 0 };
  }
  if (action === "invalid") {
    const modal = document.querySelector(".za-create-note");
    return { error: modal.querySelector('[role="alert"]').textContent, unchanged: JSON.stringify(before) === JSON.stringify(app.vault.getAllLoadedFiles().map((file) => file.path).sort()), createdCount: 0 };
  }
  if (kind === "literature") {
    fill("Source title", "Writing, Learning and Thinking");
    fill("Author", "Ahrens");
    fill("Year", "2017");
    fill("Original", "https://example.com/source");
  }
  if (args.useSource) {
    document.querySelector('.za-create-note [aria-label="Use open note as source"]').click();
  }
  document.querySelector('.za-create-note button[type="submit"]').click();
  if (action === "blocked") {
    await waitFor(() => document.querySelector('.za-create-note [role="alert"]').textContent);
    return { error: document.querySelector('.za-create-note [role="alert"]').textContent, unchanged: (await app.vault.read(app.vault.getAbstractFileByPath(`${scratch}/${kind}-folder`))) === "Do not overwrite this file.", createdCount: app.vault.getAbstractFileByPath(target) ? 1 : 0 };
  }
  await waitFor(() => !document.querySelector(".za-create-note") && app.workspace.getActiveFile()?.path === target && (kind === "fleeting" || plugin.vaultCorpus.current.get(target)));
  await plugin.vaultCorpus.rebuild();
  const file = app.vault.getAbstractFileByPath(target);
  const content = await app.vault.read(file);
  const view = app.workspace.getMostRecentLeaf().view;
  const cursor = view.editor.getCursor();
  const stage = plugin.vaultCorpus.current.stage(target);
  if (action === "duplicate") {
    await open();
    document.querySelector('.za-create-note button[type="submit"]').click();
    await waitFor(() => document.querySelector('.za-create-note [role="alert"]').textContent);
    return { error: document.querySelector('.za-create-note [role="alert"]').textContent, unchanged: (await app.vault.read(file)) === content, createdCount: app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${scratch}/${kind}-folder/`)).length };
  }
  return {
    path: target,
    content,
    stage,
    indexed: Boolean(plugin.vaultCorpus.current.get(target)),
    opened: app.workspace.getActiveFile()?.path === target && view.getMode() === "source",
    cursorLine: view.editor.getLine(cursor.line),
    precedingLine: view.editor.getLine(cursor.line - 1),
    sourceLink,
    sessionUnchanged: beforeSession === plugin.session.getSnapshot(),
  };
} finally {
  document.querySelector('.za-create-note [aria-label="Cancel note creation"]')?.click();
  const folder = app.vault.getAbstractFileByPath(scratch);
  if (folder) await app.vault.delete(folder, true);
  plugin.settings.zettelkastenRoot = originalRoot;
  plugin.settings.stageFolders = originalFolders;
  await plugin.vaultCorpus.rebuild();
}
