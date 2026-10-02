import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format } from "prettier";
import { expect, it } from "vitest";
import { buildExpandedDatasets, expansionSeedSchema } from "./expanded";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { validateSets, sha256 } from "./validate";

it("creates the explicit expanded suite once, before model execution", async () => {
  const dir = path.join(import.meta.dirname, "suites/expanded");
  if (existsSync(path.join(dir, "freeze.json")))
    throw new Error(
      "Suite already frozen; create a versioned suite instead of overwriting annotations",
    );
  const pilot = loadEvaluationData("pilot");
  const seeds = expansionSeedSchema.parse(
    JSON.parse(readFileSync(path.join(dir, "seeds.json"), "utf8")),
  );
  const corpus = loadFixtureCorpus();
  const data = buildExpandedDatasets(pilot, seeds, corpus);
  expect(validateSets(pilot.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
  const hashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(data)) {
    const bytes = await format(JSON.stringify(value), { parser: "json", printWidth: 100 });
    writeFileSync(path.join(dir, `${name}.json`), bytes);
    hashes[`${name}.json`] = sha256(bytes);
  }
  hashes["seeds.json"] = sha256(readFileSync(path.join(dir, "seeds.json"), "utf8"));
  writeFileSync(
    path.join(dir, "freeze.json"),
    `${JSON.stringify({ schema: 1, frozenAt: new Date().toISOString(), corpusHash: pilot.manifest.corpusHash, reviewerKind: "ai", humanReviews: 0, hashes, splits: { retrieval: { dev: 96, test: 24 }, answers: { dev: 48, test: 12 } }, testPolicy: "Primary source families isolated from development; freeze precedes live scores. Synthetic AI-authored labels, not blind human gold. Never tune on test outcomes." }, null, 2)}\n`,
  );
});
