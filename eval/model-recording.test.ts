import { describe, expect, it } from "vitest";
import { userText } from "../src/agent/messages";
import { ScriptedProvider, text } from "../src/testing/scripted-provider";
import { RecordedProvider, StrictReplayProvider } from "./model-recording";

describe("strict model replay", () => {
  it("records requests without headers and reproduces output only on identical inputs", async () => {
    const recorder = new RecordedProvider(new ScriptedProvider([[text("answer")]]));
    const request = { system: "s", messages: [userText("q")], tools: [], allowTools: false };
    const handlers = { onText: () => {}, onThinking: () => {} };
    const response = await recorder.send(request, handlers);
    const replay = new StrictReplayProvider(recorder.provider, recorder.model, recorder.exchanges);
    expect(replay.remaining).toBe(1);
    expect(await replay.send(request, handlers)).toEqual(response);
    expect(replay.remaining).toBe(0);
    await expect(replay.send(request, handlers)).rejects.toThrow("exhausted");
    const strict = new StrictReplayProvider("scripted", "scripted", recorder.exchanges);
    await expect(strict.send({ ...request, system: "changed" }, handlers)).rejects.toThrow(
      "changed",
    );
    expect(strict.remaining).toBe(1);
    expect(recorder.describeError(new Error("x"))).toBe("x");
    expect(strict.describeError(null)).toBe("Replay failed");
    const signal = AbortSignal.abort();
    await expect(strict.send(request, handlers, signal)).rejects.toThrow("aborted");
  });
});
