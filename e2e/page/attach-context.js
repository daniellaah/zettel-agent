// Attaches context through the composer like a user: "@" + pick, the open-note chip, and a
// selection chip; then asks and reports what the chat rendered.
const plugin = app.plugins.plugins["zettel-agent"];
// openLinkText creates missing notes. A stale fixture must fail without changing it.
if (!app.metadataCache.getFirstLinkpathDest(args.openNote, "")) {
  throw new Error(`Required fixture note is missing: ${args.openNote}`);
}
const session = plugin.session;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = () => document.querySelector(".za-chat");
const input = () => root().querySelector(".za-composer-input");
const type = (value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(input(), value);
  input().setSelectionRange(value.length, value.length);
  input().dispatchEvent(new Event("input", { bubbles: true }));
};
const key = (name) =>
  input().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
const labels = (selector) => [...root().querySelectorAll(`${selector} .za-chip-label`)].map((c) => c.textContent);
const chips = () => labels(".za-composer .za-chip:not(.za-chip-suggestion)");
const suggestions = () => labels(".za-composer .za-chip-suggestion");

session.reset();
await wait(200);

// 1. "@" opens the popover; Enter attaches the highlighted note and removes "@query".
input().focus();
type("@Swing");
await wait(200);
const options = [...root().querySelectorAll(".za-mentions li .za-mention-title")].map((o) => o.textContent);
key("Enter");
await wait(200);
const afterMention = { draft: input().value, chips: chips() };

// 2. Open a note and select text in it: both appear as suggestion chips. The selection is
// made in reading view with a DOM range, as a mouse drag would (editor APIs ignore
// programmatic selections while the chat has focus).
await app.workspace.openLinkText(args.openNote, "", false);
await wait(500);
const view = app.workspace.getMostRecentLeaf().view;
await view.setState({ ...view.getState(), mode: "preview" }, { history: false });
await wait(500);
const paragraph = view.contentEl.querySelector(".markdown-preview-view p");
const range = document.createRange();
range.selectNodeContents(paragraph);
window.getSelection().removeAllRanges();
window.getSelection().addRange(range);
await wait(300);
const offered = suggestions();
for (const button of root().querySelectorAll(".za-composer .za-chip-suggestion")) button.click();
await wait(200);
const attached = chips();

// 3. Ask; the user bubble keeps the chips and the answer can cite attached notes.
type(args.question);
key("Enter");
await wait(300);
while (session.getSnapshot().running) await wait(300);
const item = session.getSnapshot().items.at(-1);
const cited = (item.citations?.valid ?? []).map((id) => session.evidence(id)?.path);
return {
  options,
  afterMention,
  offered,
  attached,
  bubbleChips: labels(".za-message-user .za-chip"),
  stop: item.stop,
  error: item.error,
  citedPaths: [...new Set(cited)],
  composerCleared: input().value === "" && chips().length === 0,
};
