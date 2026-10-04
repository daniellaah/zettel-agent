document.querySelector('.za-chat .za-header button[aria-label="New chat"]').click();
await new Promise((r) => setTimeout(r, 300));
return {
  items: app.plugins.plugins["zettel-agent"].session.getSnapshot().items.length,
  starters: document.querySelectorAll(".za-chat .za-starters button").length,
};
