import { describe, expect, it } from "vitest";
import { runConfig, selectItems } from "./run-config";

describe("evaluation opt-in and selection", () => {
  it("defaults to no-network smoke and isolates dev/test", () => {
    expect(runConfig({})).toMatchObject({ mode: "smoke", split: "dev", repeats: 1, live: null });
    const items = [
      { id: "d", split: "dev" },
      { id: "t", split: "test" },
    ];
    expect(selectItems(items, "dev", [])).toEqual([items[0]]);
    expect(selectItems(items, "test", ["t"])).toEqual([items[1]]);
    expect(() => selectItems(items, "dev", ["t"])).toThrow("wrong split");
    expect(() => selectItems(items, "dev", ["d", "d"])).toThrow("Duplicate");
    expect(() => selectItems([], "dev", [])).toThrow("No selected");
  });
  it("requires live authorization, explicit model prices, allowance, and replay directory", () => {
    expect(() => runConfig({ EVAL_MODE: "live" })).toThrow("ALLOW_API");
    expect(() => runConfig({ EVAL_MODE: "live", EVAL_ALLOW_API: "1" })).toThrow();
    expect(() => runConfig({ EVAL_MODE: "replay" })).toThrow("REPLAY_DIR");
    expect(
      runConfig({ EVAL_MODE: "replay", EVAL_REPLAY_DIR: "/tmp/r", EVAL_REPEATS: "2" }),
    ).toMatchObject({ mode: "replay", repeats: 2 });
    const model = JSON.stringify({
      provider: "anthropic",
      model: "explicit-model",
      rates: { input: 1, output: 1, cacheRead: 0, cacheWrite: 1 },
    });
    expect(
      runConfig({
        EVAL_MODE: "live",
        EVAL_ALLOW_API: "1",
        EVAL_AGENT_MODEL: model,
        EVAL_JUDGE_MODEL: model,
        EVAL_MAX_USD: "5",
      }),
    ).toMatchObject({ live: { maxUsd: 5, maxCalls: 200 } });
    expect(() => runConfig({ EVAL_REPEATS: "0" })).toThrow();
  });
});
