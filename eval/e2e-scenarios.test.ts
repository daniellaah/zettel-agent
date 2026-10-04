import { expect, it } from "vitest";
import { ATTACH_NOTE, SCENARIOS } from "../e2e/scenarios";
import { loadFixtureCorpus } from "./fixture-vault";

it("keeps live UI expectations and attachment targets in the current research corpus", () => {
  const corpus = loadFixtureCorpus();
  expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
  for (const scenario of SCENARIOS) {
    expect(scenario.question.trim()).not.toBe("");
    for (const file of scenario.expect)
      expect(corpus.get(file), `${scenario.id}: ${file}`).toBeDefined();
  }
  expect(corpus.get(`02-Zettelkasten/Permanent/${ATTACH_NOTE}.md`)).toBeDefined();
  expect(
    corpus.get("02-Zettelkasten/Permanent/Missing deployment measurement - e2e.md"),
  ).toBeUndefined();
});
