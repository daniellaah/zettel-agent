import { z } from "zod";
import { PROVIDER_IDS } from "../src/agent/providers/catalog";

const rates = z
  .object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
  })
  .strict();
export const modelConfigSchema = z
  .object({ provider: z.enum(PROVIDER_IDS), model: z.string().min(1), rates })
  .strict();

/** Explicit live opt-in, models and rates. This object never contains credentials. */
export function runConfig(env: Record<string, string | undefined>) {
  const mode = z.enum(["smoke", "live", "replay"]).parse(env.EVAL_MODE ?? "smoke");
  const repeats = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .parse(env.EVAL_REPEATS ?? "1");
  const split = z.enum(["dev", "test"]).parse(env.EVAL_SPLIT ?? "dev");
  const ids = env.EVAL_IDS?.split(",").filter(Boolean) ?? [];
  const replayDir = env.EVAL_REPLAY_DIR ?? null;
  if (mode === "replay" && !replayDir) throw new Error("Replay requires EVAL_REPLAY_DIR");
  if (mode === "live" && env.EVAL_ALLOW_API !== "1")
    throw new Error("Live calls require EVAL_ALLOW_API=1");
  const live =
    mode === "live"
      ? {
          agent: modelConfigSchema.parse(JSON.parse(env.EVAL_AGENT_MODEL ?? "null")),
          judge: modelConfigSchema.parse(JSON.parse(env.EVAL_JUDGE_MODEL ?? "null")),
          maxUsd: z.coerce.number().positive().parse(env.EVAL_MAX_USD),
          maxCalls: z.coerce
            .number()
            .int()
            .min(1)
            .max(10_000)
            .parse(env.EVAL_MAX_CALLS ?? "200"),
        }
      : null;
  return { mode, repeats, split, ids, replayDir, live };
}
