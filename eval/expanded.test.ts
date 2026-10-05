import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { evaluationFiles, loadEvaluationData } from "./fixture-vault";
import { sha256 } from "./validate";

it("routes only named suites and binds every expanded annotation byte", () => {
  expect(() => evaluationFiles("../other")).toThrow("Unknown evaluation suite");
  const data = loadEvaluationData("expanded");
  expect(data.answers.items).toHaveLength(60);
  expect(data.retrieval.items.filter((x) => x.split === "test")).toHaveLength(24);
  const dir = path.dirname(data.files.answers);
  const freeze = JSON.parse(readFileSync(path.join(dir, "freeze.json"), "utf8")) as {
    hashes: Record<string, string>;
    corpusHash: string;
  };
  expect(freeze.corpusHash).toBe(data.manifest.corpusHash);
  for (const [file, hash] of Object.entries(freeze.hashes))
    expect(sha256(readFileSync(path.join(dir, file), "utf8"))).toBe(hash);
});
