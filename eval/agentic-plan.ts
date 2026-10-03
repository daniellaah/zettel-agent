import type { AnswerItem } from "./agent-runner";
import type { RobustCase } from "./robustness";
export interface AgenticCase extends RobustCase {
  updateBeforeFinal?: { path: string; body: string }[];
}
export const AGENTIC_VARIANTS = [
  { id: "bm25", retrieval: "lexical", review: "structural" },
  { id: "hybrid", retrieval: "hybrid", review: "structural" },
  { id: "hybrid-review", retrieval: "hybrid", review: "self-review" },
] as const;
export const AGENTIC_DEV_IDS = ["a02", "a03", "a04", "a05", "a09", "a10"];
/** Freeze jobs before any answers are observed; dev, new robustness, then previously-used test. */
export function agenticPlan(items: AnswerItem[], cases: AgenticCase[], repeats = 1) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("Invalid repeats");
  if (
    new Set([...items.map((i) => i.id), ...cases.map((i) => i.id)]).size !==
    items.length + cases.length
  )
    throw new Error("Duplicate evaluation ids");
  const selected = [
    ...AGENTIC_DEV_IDS.map((id) => {
      const item = items.find((i) => i.id === id && i.split === "dev");
      if (!item) throw new Error(`Missing paired development case ${id}`);
      return { id, group: "dev" };
    }),
    ...cases.map((test) => ({ id: test.id, group: "new-robustness" })),
    ...items
      .filter((i) => i.split === "test")
      .map((item) => ({ id: item.id, group: "previously-used-test" })),
  ];
  return selected.flatMap((item) =>
    Array.from({ length: repeats }, (_, index) =>
      AGENTIC_VARIANTS.map((_, offset) => {
        // Rotate order to reduce a fixed warm/cache or temporal advantage; all three remain paired.
        const variant =
          AGENTIC_VARIANTS[(index + offset + selected.indexOf(item)) % AGENTIC_VARIANTS.length]!;
        return {
          ...item,
          trial: index + 1,
          variant,
          name: `${item.group}-${item.id}-${index + 1}-${variant.id}`,
        };
      }),
    ).flat(),
  );
}

/** A separate phase flag prevents an existing .env EVAL_MODE=live from dispatching paid calls. */
export function agenticPhase(env: Record<string, string | undefined>): "prepare" | "live" {
  const phase = env.AGENTIC_PHASE ?? "prepare";
  if (phase !== "prepare" && phase !== "live") throw new Error("Invalid AGENTIC_PHASE");
  if (phase === "live" && env.EVAL_ALLOW_API !== "1")
    throw new Error("Live Agentic evaluation requires EVAL_ALLOW_API=1");
  return phase;
}

/** Correctness references describe the final synthetic state; grounding still uses delivered text. */
export function agenticReference(
  item: AnswerItem,
  updates: AgenticCase["updateBeforeFinal"],
): AnswerItem {
  if (!updates?.length) return item;
  return {
    ...item,
    evidence: Object.fromEntries(
      Object.entries(item.evidence).map(([id, evidence]) => {
        const update = updates.find((note) => note.path === evidence.path);
        return [id, update ? { ...evidence, excerpt: update.body } : evidence];
      }),
    ),
  };
}
