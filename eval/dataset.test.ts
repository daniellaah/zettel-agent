import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseNote } from "../src/retrieval/markdown";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { answerSetSchema, manifestSchema, retrievalSetSchema } from "./schema";
import {
  evidenceText,
  readSnapshot,
  sha256,
  snapshotDigest,
  validateSets,
  validateSnapshot,
} from "./validate";

describe("frozen evaluation corpus and annotations", () => {
  it("loads 318 unchanged notes, 120 queries and 60 rubrics without writing the vault", () => {
    const data = loadEvaluationData();
    const corpus = loadFixtureCorpus();
    expect(corpus.size).toBe(318);
    expect(data.retrieval.items).toHaveLength(120);
    expect(data.answers.items).toHaveLength(60);
    expect(validateSnapshot(data.manifest, readSnapshot(corpus))).toEqual([]);
    expect(validateSets(data.manifest, data.retrieval, data.answers, corpus)).toEqual([]);
    expect(
      sha256(
        readFileSync(
          path.resolve(import.meta.dirname, "../fixtures/technical-note-audit.json"),
          "utf8",
        ),
      ),
    ).toBe(data.manifest.sourceAuditSha256);
    expect(data.manifest.notes.filter((note) => note.stage === "literature")).toHaveLength(137);
    expect(data.manifest.notes.filter((note) => note.stage === "permanent")).toHaveLength(181);
  });
  it("binds snapshot paths, stages and bytes independently of enumeration order", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const notes = loadEvaluationData().manifest.notes;
    expect(snapshotDigest([...notes].reverse())).toBe(snapshotDigest(notes));
    expect(
      snapshotDigest([{ ...notes[0]!, sha256: sha256("changed") }, ...notes.slice(1)]),
    ).not.toBe(snapshotDigest(notes));
  });
  it("rejects a snapshot file excluded from the indexed research scope", () => {
    const { manifest, retrieval, answers } = loadEvaluationData();
    const corpus = loadFixtureCorpus();
    corpus.remove(manifest.notes[0]!.path);
    expect(() => readSnapshot(corpus)).toThrow("Unexpected research note stage");
    expect(validateSets(manifest, retrieval, answers, corpus).join("\n")).toContain(
      "Frozen note absent from research corpus",
    );
  });
  it("detects changed, deleted, added and duplicate frozen notes", () => {
    const { manifest } = loadEvaluationData();
    const changed = [
      { ...manifest.notes[0]!, sha256: sha256("changed") },
      ...manifest.notes.slice(1),
    ];
    expect(validateSnapshot(manifest, changed).join("\n")).toContain("Changed frozen note");
    expect(validateSnapshot(manifest, manifest.notes.slice(1)).join("\n")).toContain(
      "Missing frozen note",
    );
    expect(
      validateSnapshot(manifest, [
        ...manifest.notes,
        { ...manifest.notes[0]!, path: "02-Zettelkasten/Permanent/Unfrozen.md" },
      ]).join("\n"),
    ).toContain("Unfrozen note");
    expect(
      validateSnapshot(manifest, [...manifest.notes, manifest.notes[0]!]).join("\n"),
    ).toContain("Duplicate snapshot paths");
    expect(
      validateSnapshot({ ...manifest, corpusHash: sha256("wrong") }, manifest.notes),
    ).toContain("Manifest digest is inconsistent");
  });
  it("rejects invalid grades, traversal paths, unsupported fields and empty supporting sets", () => {
    const data = loadEvaluationData();
    const item = data.retrieval.items[0]!;
    const file = Object.keys(item.judgments)[0]!;
    expect(
      retrievalSetSchema.safeParse({
        ...data.retrieval,
        items: [{ ...item, judgments: { [file]: { ...item.judgments[file], grade: 3 } } }],
      }).success,
    ).toBe(false);
    expect(
      manifestSchema.safeParse({
        ...data.manifest,
        notes: [{ ...data.manifest.notes[0], path: "../outside.md" }],
      }).success,
    ).toBe(false);
    const answer = data.answers.items[0]!;
    expect(
      answerSetSchema.safeParse({
        ...data.answers,
        items: [{ ...answer, keyPoints: [{ ...answer.keyPoints[0], supportSets: [[]] }] }],
      }).success,
    ).toBe(false);
    expect(answerSetSchema.safeParse({ ...data.answers, surprise: true }).success).toBe(false);
  });
  it("rejects stale excerpts and invented evidence alternatives", () => {
    const data = loadEvaluationData();
    const file = Object.keys(data.retrieval.items[0]!.judgments).find(
      (file) => data.retrieval.items[0]!.judgments[file]!.grade > 0,
    )!;
    data.retrieval.items[0]!.judgments[file]!.excerpts = ["Unsupported invented claim"];
    data.answers.items[0]!.keyPoints[0]!.supportSets = [["nonexistent"]];
    const issues = validateSets(
      data.manifest,
      data.retrieval,
      data.answers,
      loadFixtureCorpus(),
    ).join("\n");
    expect(issues).toContain("stale judgment excerpt");
    expect(issues).toContain("unknown evidence alternative");
  });
  it("detects unknown note paths and dataset version mismatches", () => {
    const data = loadEvaluationData();
    data.retrieval.corpusId = "another-version";
    data.answers.items[0]!.evidence.storage!.path = "02-Zettelkasten/Literature/Missing.md";
    const issues = validateSets(
      data.manifest,
      data.retrieval,
      data.answers,
      loadFixtureCorpus(),
    ).join("\n");
    expect(issues).toContain("corpusId mismatch");
    expect(issues).toContain("unknown evidence path");
  });
  it("prevents question-family leakage and duplicate item ids across the two sets", () => {
    const data = loadEvaluationData();
    data.answers.items[0]!.split = "test";
    data.answers.items[1]!.id = data.retrieval.items[0]!.id;
    const issues = validateSets(
      data.manifest,
      data.retrieval,
      data.answers,
      loadFixtureCorpus(),
    ).join("\n");
    expect(issues).toContain("Family leaks across splits");
    expect(issues).toContain("Duplicate item id");
  });
  it("does not silently assign positive support to a no-answer question", () => {
    const data = loadEvaluationData();
    data.retrieval.items[0]!.answerability = "no-answer";
    data.answers.items[0]!.answerability = "no-answer";
    const issues = validateSets(
      data.manifest,
      data.retrieval,
      data.answers,
      loadFixtureCorpus(),
    ).join("\n");
    expect(issues).toContain("inconsistent answerability");
    expect(issues).toContain("no-answer point claims positive support");
  });
  it("requires supported and missing parts in a partial rubric", () => {
    const data = loadEvaluationData();
    const partial = data.answers.items.find((item) => item.answerability === "partial")!;
    partial.keyPoints = partial.keyPoints.filter((point) => point.supportSets.length > 0);
    expect(
      validateSets(data.manifest, data.retrieval, data.answers, loadFixtureCorpus()).join("\n"),
    ).toContain("partial rubric lacks supported and missing parts");
  });
  it("separates metadata provenance from body claims and validates graph expectations", () => {
    const note = parseNote(
      "p.md",
      '---\ntype: permanent\nsource:\n  - "[[Literature]]"\n---\n# Thought\n\nBody claim.',
    );
    expect(evidenceText(note, "metadata")).toContain("[[Literature]]");
    expect(evidenceText(note, "metadata")).not.toContain("Body claim.");
    expect(evidenceText(note, "permanent-inference")).toContain("Body claim.");
    expect(evidenceText(note, "literature-paraphrase")).not.toContain("[[Literature]]");
    const data = loadEvaluationData();
    data.answers.items.find((item) => item.kind === "link-suggestion")!.graphChecks[0]!.relation =
      "outlink";
    expect(
      validateSets(data.manifest, data.retrieval, data.answers, loadFixtureCorpus()).join("\n"),
    ).toContain("graph expectation is false");
  });
  it("rejects malformed provenance and extra metadata in an in-memory fixture", () => {
    const data = loadEvaluationData();
    const corpus = loadFixtureCorpus();
    const file = data.manifest.notes.find((note) => note.stage === "permanent")!.path;
    corpus.upsert(
      file,
      '---\ntype: permanent\ncreated: "2026-10-02"\nsource:\n  - "[[Missing source]]"\nextra: accidental\n---\n# Thought\n\nBody.',
    );
    const issues = validateSets(data.manifest, data.retrieval, data.answers, corpus).join("\n");
    expect(issues).toContain("Invalid metadata fields");
    expect(issues).toContain("Invalid permanent provenance");
    expect(issues).toContain("Unresolved corpus links");
  });
});
