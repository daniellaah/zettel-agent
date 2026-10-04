// Stops a turn mid-flight, then checks the conversation can continue.
const session = app.plugins.plugins["zettel-agent"].session;
session.reset();
const pending = session.send(args.first);
await new Promise((r) => setTimeout(r, args.stopAfterMs));
session.stop();
await pending;
const stopped = session.getSnapshot().items.at(-1);
await session.send(args.second);
const after = session.getSnapshot().items.at(-1);
return {
  firstStop: stopped.stop,
  secondStop: after.stop,
  secondError: after.error,
  secondAnswerChars: after.parts.filter((p) => p.kind === "text").map((p) => p.text).join("").length,
};
