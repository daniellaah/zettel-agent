// Clicks "Ask again" on the last answer: the answer is replaced, the question is kept.
const session = app.plugins.plugins["zettel-agent"].session;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const before = session.getSnapshot().items;
const button = document.querySelector('.za-chat .za-message-footer button[aria-label^="Ask again"]');
if (!button) return null;
const retryButtons = document.querySelectorAll('.za-chat button[aria-label^="Ask again"]').length;
button.click();
await wait(300);
while (session.getSnapshot().running) await wait(300);
const after = session.getSnapshot().items;
return {
  retryButtons,
  sameCount: after.length === before.length,
  sameQuestion: after.at(-2).text === before.at(-2).text,
  newAnswerId: after.at(-1).id !== before.at(-1).id,
  stop: after.at(-1).stop,
  error: after.at(-1).error,
};
