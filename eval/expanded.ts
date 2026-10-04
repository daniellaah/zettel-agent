import { z } from "zod";
import type { Corpus } from "../src/retrieval/corpus";
import type { AnswerSet, RetrievalSet } from "./schema";

const text = z.string().min(1);
export const expansionSeedSchema = z
  .object({
    schema: z.literal(1),
    reviewerKind: z.literal("ai"),
    seeds: z
      .array(
        z
          .object({
            id: text,
            family: text,
            split: z.enum(["dev", "test"]),
            literatureTitle: text,
            question: text,
            paraphraseQuery: text,
            keyPoints: z.array(text).length(2),
            forbidden: z.array(text).min(1),
            positives: z.array(
              z.object({ title: text, grade: z.union([z.literal(1), z.literal(2)]) }).strict(),
            ),
          })
          .strict(),
      )
      .length(48),
  })
  .strict();
export type ExpansionSeeds = z.infer<typeof expansionSeedSchema>;

/** Explicit AI annotations only; unreviewed lexical candidates remain unjudged. */
export function buildExpandedDatasets(
  pilot: { answers: AnswerSet; retrieval: RetrievalSet },
  seeds: ExpansionSeeds,
  corpus: Corpus,
) {
  const answers: AnswerSet = structuredClone(pilot.answers);
  const retrieval: RetrievalSet = structuredClone(pilot.retrieval);
  answers.review = retrieval.review = "ai-reviewed; human-review-not-performed";
  const hardNegatives = [
    "02-Zettelkasten/Literature/Literature notes.md",
    "02-Zettelkasten/Literature/Dropout as shared-subnetwork training.md",
    "02-Zettelkasten/Literature/Checkpoint state and source replay in Flink.md",
  ];
  for (const seed of seeds.seeds) {
    const file = `02-Zettelkasten/Literature/${seed.literatureTitle}.md`;
    const note = corpus.get(file);
    if (!note || note.type !== "literature") throw new Error(`Missing literature seed: ${file}`);
    const paragraphs = note.sections
      .flatMap((s) => s.text.split(/\n\n/))
      .filter((s) => s.trim() && !s.startsWith("#"));
    const excerpt = paragraphs.join("\n\n");
    const evidence = { source: { path: file, basis: "literature-paraphrase" as const, excerpt } };
    answers.items.push({
      id: seed.id,
      family: seed.family,
      split: seed.split,
      origin: "synthetic",
      lang: "en",
      question: seed.question,
      kind: "lookup",
      answerability: "answerable",
      history: [],
      activeNote: null,
      evidence,
      keyPoints: seed.keyPoints.map((point, i) => ({
        id: `p${i + 1}`,
        text: point,
        supportSets: [["source"]],
      })),
      forbidden: seed.forbidden,
      graphChecks: [],
      notes:
        "AI-authored interview question grounded in the frozen literature record. No source text is supplied to the solver; alternative delivered supporting records remain acceptable.",
    });
    const positives = [
      [file, 2] as const,
      ...seed.positives.map((x) => [`02-Zettelkasten/Permanent/${x.title}.md`, x.grade] as const),
    ];
    const judgments: RetrievalSet["items"][number]["judgments"] = {};
    for (const [path, grade] of positives) {
      const target = corpus.get(path);
      if (!target) throw new Error(`Missing explicit relevance target: ${path}`);
      judgments[path] = {
        grade,
        rationale:
          grade === 2
            ? `This record supplies the requested mechanism or distinction for ${seed.literatureTitle}.`
            : `This atomic record supplies a premise or qualification for the requested ${seed.literatureTitle} distinction, but not all requested details.`,
        excerpts: target.sections
          .flatMap((s) => s.text.split(/\n\n/))
          .filter((s) => s.trim() && !s.startsWith("#")),
      };
    }
    for (const path of hardNegatives)
      if (!judgments[path]) {
        const target = corpus.get(path);
        if (!target) throw new Error(`Missing negative control: ${path}`);
        judgments[path] = {
          grade: 0,
          rationale: `This control describes ${target.title}, rather than the specific ${seed.literatureTitle} mechanism requested.`,
          excerpts: [],
        };
      }
    for (const [index, query] of [seed.question, seed.paraphraseQuery].entries())
      retrieval.items.push({
        id: `r${String(retrieval.items.length + 1).padStart(3, "0")}`,
        family: seed.family,
        split: seed.split,
        origin: "synthetic",
        lang: "en",
        query,
        kind: index ? "paraphrase" : "lookup",
        answerability: "answerable",
        pool: { depth: 20, modes: ["words", "bigrams", "both"] },
        judgments: structuredClone(judgments),
        notes:
          "Explicit AI relevance review of source, supporting thoughts and negative controls. Other pooled candidates remain unjudged; absence from these labels never establishes irrelevance. Two phrasings share a family and split.",
      });
  }
  const extraQueries = [
    "What batch size and measured latency made speculative lookahead optimal for my service?",
    "Which A/B experiment reports my SASRec CTR lift?",
    "What was the exact production learning rate for my BPR model?",
    "What GPU model and number of machines did my own GRPO experiment actually use?",
  ];
  for (const [i, query] of extraQueries.entries()) {
    const source = pilot.retrieval.items.find((x) => x.id === `r${17 + i}`);
    if (!source) throw new Error("Missing pilot no-answer item");
    retrieval.items.push({
      ...structuredClone(source),
      id: `r${retrieval.items.length + 1}`,
      query,
      kind: "no-answer",
      notes:
        "Independent wording of the same absent owner fact; kept in its original development family.",
    });
  }
  return { answers, retrieval };
}
