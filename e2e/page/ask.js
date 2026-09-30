// Asks one question through the chat session and reports what happened.
const session = app.plugins.plugins["zettel-agent"].session;
if (args.reset) session.reset();
const started = Date.now();
await session.send(args.question);
const item = session.getSnapshot().items.at(-1);
const cited = (item.citations?.valid ?? []).map((id) => session.evidence(id)?.path);
return {
  seconds: (Date.now() - started) / 1000,
  stop: item.stop,
  error: item.error,
  answer: item.parts.filter((p) => p.kind === "text").map((p) => p.text).join(""),
  finalAnswer: item.status === "done" ? session.answerMarkdown(item) : "",
  tools: item.parts
    .filter((p) => p.kind === "tool")
    .map((p) => ({ name: p.name, summary: p.summary, isError: p.isError })),
  thinkingChars: item.parts.filter((p) => p.kind === "thinking").reduce((n, p) => n + p.text.length, 0),
  citedPaths: [...new Set(cited.filter(Boolean))],
  unknownCitations: item.citations?.unknown ?? [],
  usage: item.usage,
};
