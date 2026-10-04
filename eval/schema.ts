import { z } from "zod";

const text = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const notePath = z.string().regex(/^02-Zettelkasten\/(Literature|Permanent)\/[^/]+\.md$/);
const header = {
  schema: z.literal(1),
  corpusId: text,
  review: z.enum([
    "author-reviewed; owner-review-pending",
    "ai-reviewed; human-review-not-performed",
  ]),
};
const item = {
  id: text,
  family: text,
  split: z.enum(["dev", "test"]),
  origin: z.enum(["synthetic", "owner"]),
  lang: z.enum(["en", "zh"]),
};

export const snapshotNoteSchema = z
  .object({
    path: notePath,
    stage: z.enum(["literature", "permanent"]),
    sha256: hash,
  })
  .strict();
export const manifestSchema = z
  .object({
    schema: z.literal(1),
    corpusId: text,
    frozenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    corpusHash: hash,
    sourceAuditSha256: hash,
    notes: z.array(snapshotNoteSchema).min(1),
  })
  .strict();

export const retrievalItemSchema = z
  .object({
    ...item,
    query: text,
    kind: z.enum(["lookup", "paraphrase", "synthesis", "distinction", "no-answer"]),
    answerability: z.enum(["answerable", "no-answer"]),
    pool: z
      .object({
        depth: z.literal(20),
        modes: z.array(z.enum(["words", "bigrams", "both"])).length(3),
      })
      .strict(),
    judgments: z.record(
      notePath,
      z
        .object({
          grade: z.union([z.literal(0), z.literal(1), z.literal(2)]),
          rationale: text,
          excerpts: z.array(text),
        })
        .strict(),
    ),
    notes: text,
  })
  .strict();
export const retrievalSetSchema = z
  .object({
    ...header,
    items: z.array(retrievalItemSchema).min(1),
  })
  .strict();

export const answerItemSchema = z
  .object({
    ...item,
    question: text,
    kind: z.enum([
      "lookup",
      "synthesis",
      "provenance",
      "link-suggestion",
      "follow-up",
      "partial",
      "no-answer",
    ]),
    answerability: z.enum(["answerable", "partial", "no-answer"]),
    history: z.array(text),
    activeNote: notePath.nullable(),
    evidence: z.record(
      text,
      z
        .object({
          path: notePath,
          basis: z.enum(["literature-paraphrase", "permanent-inference", "metadata"]),
          excerpt: text,
        })
        .strict(),
    ),
    keyPoints: z
      .array(
        z
          .object({
            id: text,
            text,
            // Each set is independently sufficient; records within a set are jointly required.
            supportSets: z.array(z.array(text).min(1)),
          })
          .strict(),
      )
      .min(1),
    forbidden: z.array(text).min(1),
    graphChecks: z.array(
      z
        .object({
          from: notePath,
          to: notePath,
          relation: z.enum(["outlink", "no-direct-link"]),
        })
        .strict(),
    ),
    notes: text,
  })
  .strict();
export const answerSetSchema = z
  .object({
    ...header,
    items: z.array(answerItemSchema).min(1),
  })
  .strict();

export type SnapshotNote = z.infer<typeof snapshotNoteSchema>;
export type CorpusManifest = z.infer<typeof manifestSchema>;
export type RetrievalSet = z.infer<typeof retrievalSetSchema>;
export type AnswerSet = z.infer<typeof answerSetSchema>;
