import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Corpus } from "../src/retrieval/corpus";
import type { ParsedNote } from "../src/retrieval/markdown";
import { VAULT_DIR, walk, ZETTELKASTEN_ROOT } from "./fixture-vault";
import type { AnswerSet, CorpusManifest, RetrievalSet, SnapshotNote } from "./schema";

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Stable over enumeration order; binds paths, stages and exact file bytes. */
export function snapshotDigest(notes: SnapshotNote[]): string {
  return sha256(
    [...notes]
      .sort((a, b) => a.path.localeCompare(b.path, "en"))
      .map((note) => `${note.path}\u0000${note.stage}\u0000${note.sha256}\n`)
      .join(""),
  );
}

export function readSnapshot(corpus: Corpus): SnapshotNote[] {
  return walk(path.join(VAULT_DIR, ZETTELKASTEN_ROOT)).map((file) => {
    const relative = path.relative(VAULT_DIR, file);
    const stage = corpus.stage(relative);
    if (!corpus.get(relative) || (stage !== "literature" && stage !== "permanent")) {
      throw new Error(`Unexpected research note stage: ${relative}`);
    }
    return { path: relative, stage, sha256: sha256(readFileSync(file, "utf8")) };
  });
}

export function validateSnapshot(manifest: CorpusManifest, actual: SnapshotNote[]): string[] {
  const issues: string[] = [];
  const expected = new Map(manifest.notes.map((note) => [note.path, note]));
  const current = new Map(actual.map((note) => [note.path, note]));
  if (expected.size !== manifest.notes.length || current.size !== actual.length)
    issues.push("Duplicate snapshot paths");
  if (snapshotDigest(manifest.notes) !== manifest.corpusHash)
    issues.push("Manifest digest is inconsistent");
  for (const [file, note] of expected) {
    const found = current.get(file);
    if (!found) issues.push(`Missing frozen note: ${file}`);
    else if (found.sha256 !== note.sha256 || found.stage !== note.stage)
      issues.push(`Changed frozen note: ${file}`);
  }
  for (const file of current.keys()) if (!expected.has(file)) issues.push(`Unfrozen note: ${file}`);
  return issues;
}

/** Validate labels against the frozen corpus, without asking a model to judge itself. */
export function validateSets(
  manifest: CorpusManifest,
  retrieval: RetrievalSet,
  answers: AnswerSet,
  corpus: Corpus,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const families = new Map<string, string>();
  const frozen = new Set(manifest.notes.map((note) => note.path));
  for (const file of frozen) {
    const note = corpus.get(file);
    if (!note) {
      issues.push(`Frozen note absent from research corpus: ${file}`);
      continue;
    }
    const expectedFields =
      note.type === "literature"
        ? ["author", "created", "source", "source_title", "type", "year"]
        : ["created", "source", "type"];
    if (Object.keys(note.properties).sort().join(",") !== expectedFields.join(","))
      issues.push(`Invalid metadata fields: ${file}`);
    if (
      /\p{Script=Han}/u.test(
        evidenceText(note, "metadata") + evidenceText(note, "literature-paraphrase"),
      )
    )
      issues.push(`Non-English corpus note: ${file}`);
    if (
      note.type === "literature" &&
      (note.properties.source !== note.properties.source_title ||
        typeof note.properties.source !== "string" ||
        /^https?:|\.pdf$/i.test(note.properties.source))
    )
      issues.push(`Invalid literature source identity: ${file}`);
    if (note.type === "permanent") {
      const sources = note.properties.source;
      if (
        !Array.isArray(sources) ||
        sources.length === 0 ||
        sources.some(
          (source) =>
            !/^\[\[.+\]\]$/.test(source) ||
            corpus.stage(corpus.resolve(source, file) ?? "") !== "literature",
        )
      )
        issues.push(`Invalid permanent provenance: ${file}`);
    }
    if (corpus.graph().unresolvedLinks(file).length)
      issues.push(`Unresolved corpus links: ${file}`);
  }
  for (const set of [retrieval, answers]) {
    if (set.corpusId !== manifest.corpusId) issues.push("Dataset corpusId mismatch");
    for (const item of set.items) {
      if (ids.has(item.id)) issues.push(`Duplicate item id: ${item.id}`);
      ids.add(item.id);
      const split = families.get(item.family);
      if (split && split !== item.split) issues.push(`Family leaks across splits: ${item.family}`);
      families.set(item.family, item.split);
    }
  }
  for (const item of retrieval.items) {
    if ("modes" in item.pool && new Set(item.pool.modes).size !== 3)
      issues.push(`${item.id}: duplicate pool mode`);
    if ("term" in item.pool) {
      const term = termPattern(item.pool.term);
      const containing = [...frozen].filter((file) =>
        corpus.get(file)?.sections.some((section) => term.test(section.text)),
      );
      const positive = Object.entries(item.judgments).filter(([, j]) => j.grade === 2);
      if (
        positive.length !== Object.keys(item.judgments).length ||
        containing.sort().join("\n") !==
          positive
            .map(([file]) => file)
            .sort()
            .join("\n")
      )
        issues.push(`${item.id}: term-occurrence labels differ from the notes containing the term`);
    }
    if (/\p{Script=Han}/u.test(item.query) !== (item.lang === "zh"))
      issues.push(`${item.id}: query language is not ${item.lang}`);
    const positive = Object.values(item.judgments).filter((j) => j.grade > 0);
    if ((positive.length === 0) !== (item.answerability === "no-answer"))
      issues.push(`${item.id}: inconsistent answerability`);
    for (const [file, judgment] of Object.entries(item.judgments)) {
      const note = corpus.get(file);
      if (!frozen.has(file) || !note) issues.push(`${item.id}: unknown judgment path ${file}`);
      if (judgment.grade > 0 && judgment.excerpts.length === 0)
        issues.push(`${item.id}: positive label without evidence ${file}`);
      for (const excerpt of judgment.excerpts) {
        if (!note?.sections.some((section) => section.text.includes(excerpt)))
          issues.push(`${item.id}: stale judgment excerpt ${file}`);
      }
    }
  }
  for (const item of answers.items) {
    if (/\p{Script=Han}/u.test(item.question)) issues.push(`${item.id}: non-English question`);
    if (item.activeNote && !frozen.has(item.activeNote))
      issues.push(`${item.id}: unknown activeNote`);
    for (const [id, evidence] of Object.entries(item.evidence)) {
      const note = corpus.get(evidence.path);
      if (!frozen.has(evidence.path) || !note)
        issues.push(`${item.id}: unknown evidence path ${id}`);
      const raw = note ? evidenceText(note, evidence.basis) : "";
      if (!raw.includes(evidence.excerpt)) issues.push(`${item.id}: stale evidence excerpt ${id}`);
      if (evidence.basis === "literature-paraphrase" && note?.type !== "literature")
        issues.push(`${item.id}: wrong literature basis ${id}`);
      if (evidence.basis === "permanent-inference" && note?.type !== "permanent")
        issues.push(`${item.id}: wrong permanent basis ${id}`);
    }
    const pointIds = new Set<string>();
    for (const point of item.keyPoints) {
      if (pointIds.has(point.id)) issues.push(`${item.id}: duplicate key point ${point.id}`);
      pointIds.add(point.id);
      for (const group of point.supportSets) {
        for (const id of group)
          if (!item.evidence[id]) issues.push(`${item.id}: unknown evidence alternative ${id}`);
      }
    }
    if (
      item.answerability === "answerable" &&
      item.keyPoints.some((point) => !point.supportSets.length)
    )
      issues.push(`${item.id}: answerable point lacks support`);
    if (
      item.answerability === "partial" &&
      (!item.keyPoints.some((point) => point.supportSets.length) ||
        !item.keyPoints.some((point) => !point.supportSets.length))
    )
      issues.push(`${item.id}: partial rubric lacks supported and missing parts`);
    if (
      item.answerability === "no-answer" &&
      item.keyPoints.some((point) => point.supportSets.length)
    )
      issues.push(`${item.id}: no-answer point claims positive support`);
    for (const check of item.graphChecks) {
      if (!frozen.has(check.from) || !frozen.has(check.to))
        issues.push(`${item.id}: unknown graph endpoint`);
      const out = corpus.graph().outlinks(check.from).includes(check.to);
      const back = corpus.graph().backlinks(check.from).includes(check.to);
      if (check.relation === "outlink" ? !out : out || back)
        issues.push(`${item.id}: graph expectation is false`);
    }
  }
  return issues;
}

/** A whole word or phrase, case-insensitive, as an exact-term lookup means it. */
export function termPattern(term: string): RegExp {
  return new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");
}

// Metadata values are retained as note data, including provenance wikilinks.
export function evidenceText(
  note: ParsedNote,
  basis: "literature-paraphrase" | "permanent-inference" | "metadata",
): string {
  return (
    basis === "metadata"
      ? Object.values(note.properties).flat()
      : note.sections.map((section) => section.text)
  ).join("\n");
}
