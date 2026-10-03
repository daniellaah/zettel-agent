import { Corpus } from "../src/retrieval/corpus";
import { EvidenceLedger } from "../src/agent/evidence";
import { executeTool, toolDefinitions } from "../src/agent/tools";
import { resolveSettings, stageForPath } from "../src/settings";
import type { AnswerItem } from "./agent-runner";

export interface RobustCase {
  id: string;
  question: string;
  lang?: "en" | "zh";
  history?: string[];
  notes: { path: string; stage: "literature" | "permanent" | "fleeting"; body: string }[];
  keyPoints: string[];
  forbidden: string[];
  answerability?: "no-answer";
}

/** Synthetic adversarial data lives solely in this private in-memory corpus. */
export function robustnessTask(test: RobustCase): { item: AnswerItem; corpus: Corpus } {
  const settings = resolveSettings({ zettelkastenRoot: "02-Zettelkasten" });
  const corpus = new Corpus({ stageForPath: (p) => stageForPath(p, settings) });
  for (const note of test.notes)
    corpus.upsert(
      note.path,
      `---\ntype: ${note.stage}\n---\n# ${note.path.split("/").pop()!.slice(0, -3)}\n\n${note.body}`,
    );
  const item: AnswerItem = {
    id: test.id,
    family: test.id,
    split: "test",
    origin: "synthetic",
    lang: test.lang ?? "en",
    question: test.question,
    kind: test.answerability === "no-answer" ? "no-answer" : "lookup",
    answerability: test.answerability ?? "answerable",
    history: test.history ?? [],
    activeNote: null,
    evidence: Object.fromEntries(
      test.notes
        .filter((n) => n.stage !== "fleeting")
        .map((n, i) => [
          `record${i}`,
          {
            path: n.path,
            basis: n.stage === "permanent" ? "permanent-inference" : "literature-paraphrase",
            excerpt: n.body,
          },
        ]),
    ),
    keyPoints: test.keyPoints.map((point, i) => ({
      id: `p${i}`,
      text: point,
      supportSets:
        test.answerability === "no-answer"
          ? []
          : [test.notes.filter((n) => n.stage !== "fleeting").map((_, i) => `record${i}`)],
    })),
    forbidden: test.forbidden,
    graphChecks: [],
    notes:
      "Synthetic independent robustness test; not a literature note, source claim, human label or learning-corpus modification.",
  };
  return { item, corpus };
}

/** Interface invariants are distinct from live semantic attack resistance. */
export function robustnessInterfaceChecks(corpus: Corpus) {
  const context = { corpus, ledger: new EvidenceLedger() };
  const before = corpus.paths().map((p) => [p, corpus.get(p)!.contentHash]);
  const invalidRegex = executeTool("match", { pattern: "[", regex: true }, context);
  const unknown = executeTool("read", { target: "E999" }, context);
  const traversal = executeTool("read", { target: "../../.env.eval.local" }, context);
  const write = executeTool("write", { path: "created.md", content: "bad" }, context);
  const fleeting = executeTool("read", { target: "Private capture" }, context);
  const listed = executeTool("list", { preview: true }, context);
  return {
    readOnlyRegistry:
      toolDefinitions()
        .map((t) => t.name)
        .sort()
        .join(",") === "links,list,match,read,search",
    rejectsUnknownId: unknown.isError && unknown.evidenceIds.length === 0,
    rejectsInvalidRegex: invalidRegex.isError,
    rejectsExternalRead: traversal.isError && !traversal.evidenceIds.length,
    rejectsWrite: write.isError,
    excludesFleeting:
      !corpus.paths().some((p) => corpus.stage(p) === "fleeting") &&
      fleeting.isError &&
      !listed.content.includes("4 milliseconds"),
    corpusUnchanged:
      JSON.stringify(before) ===
      JSON.stringify(corpus.paths().map((p) => [p, corpus.get(p)!.contentHash])),
  };
}
