import { expect, it } from "vitest";
import { FakeBenchmarkEmbeddings, percentile } from "./vector-benchmark";
it("reports measured quantiles and keeps test-vector generation deterministic", async () => {
  expect(percentile([3, 1, 2], 0.5)).toBe(2);
  expect(percentile([3, 1, 2], 0.95)).toBe(3);
  expect(percentile([], 0.5)).toBeNull();
  expect(() => percentile([NaN], 0.5)).toThrow();
  expect(() => percentile([1], 2)).toThrow();
  const config = {
    provider: "fake",
    model: "fake",
    modelVersion: "1",
    dimensions: 4,
    normalization: "l2" as const,
    metric: "cosine" as const,
    batchSize: 1,
    timeoutMs: 1000,
  };
  const fake = new FakeBenchmarkEmbeddings(config);
  const signal = new AbortController().signal;
  expect(await fake.embed(["a"], signal)).toEqual(await fake.embed(["a"], signal));
  expect((await fake.embed(["a"], signal)).vectors[0]).toHaveLength(4);
});
