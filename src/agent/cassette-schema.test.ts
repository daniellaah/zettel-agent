import { expect, it } from "vitest";
import { parseCassette } from "./cassette-schema";
import {
  canonicalRequest,
  cassetteFileName,
  validateReplayBinding,
  type Cassette,
} from "./recording";
const cassette: Cassette = {
  version: 2,
  provider: "deepseek",
  model: "m",
  question: "q",
  recordedAt: "2026-10-02",
  exchanges: [],
  binding: { corpusRevision: "a", retrieval: "bm25", reviewMode: "structural" },
};
it("validates cassettes and binds corpus, retrieval and review while preserving legacy files", () => {
  expect(parseCassette(cassette)).toEqual(cassette);
  expect(() => parseCassette({ ...cassette, exchanges: [{}] })).toThrow();
  expect(() => validateReplayBinding(cassette, "a", "structural")).not.toThrow();
  expect(() => validateReplayBinding(cassette, "b", "structural")).toThrow("corpus");
  expect(() =>
    validateReplayBinding(
      { ...cassette, binding: { ...cassette.binding!, retrieval: "hybrid-local" } },
      "a",
      "structural",
    ),
  ).toThrow("Hybrid");
  expect(() => validateReplayBinding({ ...cassette, version: 1 }, "a", "structural")).toThrow(
    "Legacy",
  );
  expect(() => cassetteFileName("../escape", "m", "q")).toThrow();
});
it("canonicalizes objects but preserves value and array identity", () => {
  expect(canonicalRequest({ b: 1, a: [null, "x"] })).toBe(
    canonicalRequest({ a: [null, "x"], b: 1 }),
  );
  expect(canonicalRequest([1, 2])).not.toBe(canonicalRequest([2, 1]));
});
