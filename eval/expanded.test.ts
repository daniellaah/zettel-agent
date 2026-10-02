import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { buildExpandedDatasets, expansionSeedSchema } from "./expanded";
import { evaluationFiles, loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { sha256, validateSets } from "./validate";

it("builds source-bound labels without mutating the pilot or conflating unjudged with irrelevant", () => {
  const pilot = loadEvaluationData("pilot");
  const before = JSON.stringify(pilot);
  const seeds = expansionSeedSchema.parse(
    JSON.parse(readFileSync(path.join(import.meta.dirname, "suites/expanded/seeds.json"), "utf8")),
  );
  const corpus = loadFixtureCorpus();
  const data = buildExpandedDatasets(pilot, seeds, corpus);
  expect(data.answers.items).toHaveLength(60);
  expect(data.retrieval.items).toHaveLength(120);
  expect(data.answers.items.filter((x) => x.split === "test")).toHaveLength(12);
  expect(data.retrieval.items.filter((x) => x.split === "test")).toHaveLength(24);
  expect(validateSets(pilot.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
  expect(JSON.stringify(pilot)).toBe(before);
  expect(Object.keys(data.retrieval.items[20]!.judgments).length).toBeLessThan(corpus.size);
  const invalid = structuredClone(seeds);
  invalid.seeds[0]!.literatureTitle = "Missing";
  expect(() => buildExpandedDatasets(pilot, invalid, corpus)).toThrow("Missing literature seed");
  invalid.seeds[0] = { ...seeds.seeds[0]!, positives: [{ title: "Missing", grade: 2 }] };
  expect(() => buildExpandedDatasets(pilot, invalid, corpus)).toThrow(
    "Missing explicit relevance target",
  );
  const devSources = new Set(
    data.answers.items
      .filter((x) => x.split === "dev")
      .flatMap((x) =>
        Object.values(x.evidence).map((e) => corpus.get(e.path)?.properties.source_title),
      ),
  );
  for (const item of data.answers.items.filter((x) => x.split === "test"))
    for (const evidence of Object.values(item.evidence))
      expect(devSources.has(corpus.get(evidence.path)?.properties.source_title)).toBe(false);
});
it("routes only named suites and binds every expanded annotation byte", () => {
  expect(evaluationFiles("pilot").answers).toBe(path.join(import.meta.dirname, "answers.json"));
  expect(() => evaluationFiles("../other")).toThrow("Unknown evaluation suite");
  const data = loadEvaluationData("expanded");
  expect(data.answers.items).toHaveLength(60);
  const dir = path.dirname(data.files.answers);
  const freeze = JSON.parse(readFileSync(path.join(dir, "freeze.json"), "utf8")) as {
    hashes: Record<string, string>;
    corpusHash: string;
  };
  expect(freeze.corpusHash).toBe(data.manifest.corpusHash);
  for (const [file, hash] of Object.entries(freeze.hashes))
    expect(sha256(readFileSync(path.join(dir, file), "utf8"))).toBe(hash);
});
