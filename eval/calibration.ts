import { z } from "zod";
import type { Judgment } from "./answer-scoring";

export const humanReviewSchema = z
  .object({
    schema: z.literal(1),
    runSha256: z.string().regex(/^[a-f0-9]{64}$/),
    judgmentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reviewer: z.string().min(1),
    status: z.enum(["pending", "reviewed"]),
    labels: z.record(
      z.string(),
      z
        .enum([
          "covered",
          "partial",
          "missing",
          "contradicted",
          "supported",
          "unsupported",
          "supporting",
          "irrelevant",
          "unknown",
          "present",
          "absent",
          "appropriate",
          "inappropriate",
          "not-needed",
        ])
        .nullable(),
    ),
    comments: z.string(),
    omittedClaims: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type HumanReview = z.infer<typeof humanReviewSchema>;

/** Each label has a stable key; humans review without seeing judge labels initially. */
export function judgmentLabels(judgment: Judgment): Record<string, string> {
  const entries: [string, string][] = [
    ...judgment.keyPoints.map<[string, string]>((point) => [`keyPoint:${point.id}`, point.status]),
    ...judgment.forbidden.map<[string, string]>((condition) => [
      `forbidden:${condition.index}`,
      condition.present ? "present" : "absent",
    ]),
    ...judgment.claims.flatMap<[string, string]>((claim) => [
      [`claim:${claim.id}`, claim.verdict],
      ...claim.citations.map<[string, string]>((citation) => [
        `citation:${claim.id}:${citation.id}`,
        citation.verdict,
      ]),
    ]),
    ["abstention", judgment.abstention.status],
  ];
  return Object.fromEntries(entries);
}

export function calibrationReport(
  judge: Record<string, string>,
  human: HumanReview,
  binding: { runSha256: string; judgmentSha256: string },
) {
  if (human.status !== "reviewed") throw new Error("Human review is still pending");
  if (human.runSha256 !== binding.runSha256 || human.judgmentSha256 !== binding.judgmentSha256)
    throw new Error("Human review refers to a different run or judgment");
  if (
    Object.keys(judge).sort().join("\n") !== Object.keys(human.labels).sort().join("\n") ||
    Object.values(human.labels).some((label) => label === null)
  )
    throw new Error("Human labels are incomplete");
  const pairs = Object.entries(judge).map(([key, model]) => ({
    key,
    model,
    human: human.labels[key]!,
  }));
  const allowed: Record<string, string[]> = {
    keyPoint: ["covered", "partial", "missing", "contradicted"],
    forbidden: ["present", "absent"],
    claim: ["supported", "partial", "unsupported", "contradicted"],
    citation: ["supporting", "irrelevant", "unknown"],
    abstention: ["appropriate", "inappropriate", "not-needed"],
  };
  for (const pair of pairs) {
    const labels = allowed[pair.key.split(":")[0]!];
    if (!labels?.includes(pair.model) || !labels.includes(pair.human))
      throw new Error(`Invalid label category: ${pair.key}`);
  }
  const groups = ["all", "keyPoint", "forbidden", "claim", "citation", "abstention"];
  return groups.map((group) => {
    const rows = pairs.filter((pair) => group === "all" || pair.key.split(":")[0] === group);
    const agreement = rows.length
      ? rows.filter((row) => row.model === row.human).length / rows.length
      : null;
    const classes = new Set(rows.flatMap((row) => [row.model, row.human]));
    const chance = rows.length
      ? [...classes].reduce(
          (sum, label) =>
            sum +
            (rows.filter((row) => row.model === label).length / rows.length) *
              (rows.filter((row) => row.human === label).length / rows.length),
          0,
        )
      : null;
    return {
      group,
      labels: rows.length,
      agreement,
      kappa:
        group !== "all" && agreement !== null && chance !== null && chance < 1
          ? (agreement - chance) / (1 - chance)
          : null,
      disagreements: rows.filter((row) => row.model !== row.human),
      // A critical error is accepting support that the human rejects.
      falseSupport: rows.filter(
        (row) =>
          ["supported", "supporting"].includes(row.model) &&
          !["supported", "supporting"].includes(row.human),
      ).length,
    };
  });
}
