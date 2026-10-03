import { expect, it } from "vitest";
import { ReleaseAllowance } from "./release-allowance";
const body = JSON.stringify({ model: "deepseek-flash", max_tokens: 8192, messages: [] });
it("reserves before actual dispatch, counts failures and enforces money/request/scenario caps", () => {
  const budget = new ReleaseAllowance(5, 2);
  const failed = budget.begin("error", body);
  budget.finish(failed, 404, "{}");
  expect(failed.outcome).toBe("unknown");
  expect(budget.accountedUsd).toBeGreaterThan(0);
  budget.begin("cancel", body);
  expect(() => budget.begin("new", body)).toThrow("exhausted");
  expect(() => new ReleaseAllowance(0.001).begin("q", body)).toThrow("exhausted");
  const turns = new ReleaseAllowance();
  for (let i = 0; i < 10; i++) turns.begin("same", body);
  expect(() => turns.begin("same", body)).toThrow("scenario");
});
it("accounts cache input and output; malformed/unknown usage never becomes free", () => {
  const budget = new ReleaseAllowance();
  const a = budget.begin("q", body);
  budget.finish(
    a,
    200,
    'data: {"usage":{"prompt_tokens":1000,"completion_tokens":200,"prompt_cache_hit_tokens":800}}\n\ndata: [DONE]\n',
  );
  expect(a.usage).toEqual({ input: 200, output: 200, cache: 800 });
  expect(a.accountedUsd).toBeCloseTo(0.0003048);
  const unknown = budget.begin("bad", body);
  budget.finish(unknown, 200, "data: {}\n");
  expect(unknown.usage).toBeNull();
  expect(unknown.accountedUsd).toBeGreaterThan(0);
});
it("rejects unsupported models and excessive encoded input/output", () => {
  const budget = new ReleaseAllowance();
  for (const invalid of [
    { model: "other", max_tokens: 8192 },
    { model: "deepseek-flash", max_tokens: 32000 },
    { model: "deepseek-flash", max_tokens: 8192, input: "x".repeat(65536) },
  ])
    expect(() => budget.begin("q", JSON.stringify(invalid))).toThrow("frozen");
});
