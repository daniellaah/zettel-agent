// Structure of the rendered chat, for assertions without screenshots.
const root = document.querySelector(".za-chat");
if (!root) return null;
// Markdown renders asynchronously (and is throttled while streaming). Every citation
// outside code must end up as a chip: wait up to 3 s for the rest to be decorated.
// Same pattern as CITATION in src/agent/evidence.ts.
const CITATION = /\[(E\d+(?:[^[\]\nE]{1,6}E\d+)*)\]/;
const rawCitations = () => {
  let count = 0;
  for (const block of root.querySelectorAll(".za-markdown")) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest("code, pre") && CITATION.test(node.data)) count++;
    }
  }
  return count;
};
for (let waited = 0; waited < 3000 && rawCitations() > 0; waited += 100) {
  await new Promise((r) => setTimeout(r, 100));
}
const count = (selector) => root.querySelectorAll(selector).length;
return {
  userMessages: count(".za-message-user"),
  assistantMessages: count(".za-message-assistant"),
  markdownBlocks: count(".za-markdown"),
  toolRows: count(".za-tool"),
  runningToolRows: count(".za-tool.is-running"),
  citationChips: count(".za-cite"),
  unknownChips: count(".za-cite-unknown"),
  rawCitationsLeft: rawCitations(),
  chipTitles: [...root.querySelectorAll(".za-cite")].slice(0, 3).map((c) => c.title),
  internalLinks: count("a.internal-link"),
  unresolvedLinks: [...root.querySelectorAll("a.internal-link.is-unresolved")].map((a) => a.dataset.href),
  footerButtons: [...root.querySelectorAll(".za-message-footer button")].map((b) => b.getAttribute("aria-label")),
  usageText: root.querySelector(".za-usage")?.textContent ?? null,
  headerModel: root.querySelector(".za-header-model")?.textContent ?? null,
  starters: count(".za-starters button"),
  composerButton: root.querySelector(".za-composer button")?.getAttribute("aria-label") ?? null,
};
