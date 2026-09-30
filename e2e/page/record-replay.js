// Records one question, then replays it with the network blocked.
const plugin = app.plugins.plugins["zettel-agent"];
const session = plugin.session;
const settings = plugin.settings;
const previousMode = settings.recordingMode;
const lastText = () =>
  session.getSnapshot().items.at(-1).parts.filter((p) => p.kind === "text").map((p) => p.text).join("");
try {
  settings.recordingMode = "record";
  session.reset();
  await session.send(args.question);
  const recordedItem = session.getSnapshot().items.at(-1);
  await new Promise((r) => setTimeout(r, 500)); // let the last cassette write finish
  const cassette = await plugin.recordings.load(settings.provider, settings.models[settings.provider], args.question);

  settings.recordingMode = "replay";
  const realFetch = window.fetch;
  let networkCalls = 0;
  window.fetch = (...a) => {
    networkCalls++;
    return realFetch(...a);
  };
  session.reset();
  const started = Date.now();
  await session.send(args.question);
  const replayedItem = session.getSnapshot().items.at(-1);
  const replaySeconds = (Date.now() - started) / 1000;
  window.fetch = realFetch;

  session.reset();
  await session.send("A question that was never recorded " + Date.now());
  const missing = session.getSnapshot().items.at(-1);
  const questions = await plugin.recordings.questions(settings.provider, settings.models[settings.provider]);
  return {
    recordedStop: recordedItem.stop,
    exchanges: cassette?.exchanges.length ?? 0,
    cassetteHasKey: JSON.stringify(cassette ?? {}).includes(app.secretStorage.getSecret(settings.apiKeySecretIds[settings.provider]) ?? "\u0000"),
    replayedStop: replayedItem.stop,
    replayedError: replayedItem.error,
    sameAnswer: lastTextOf(recordedItem) === lastTextOf(replayedItem),
    sameTools: toolNames(recordedItem) === toolNames(replayedItem),
    networkCalls,
    replaySeconds,
    missingError: missing.error,
    listed: questions.includes(args.question),
  };
} finally {
  settings.recordingMode = previousMode;
}
function lastTextOf(item) {
  return item.parts.filter((p) => p.kind === "text").map((p) => p.text).join("");
}
function toolNames(item) {
  return item.parts.filter((p) => p.kind === "tool").map((p) => `${p.name}:${p.summary}`).join("|");
}
