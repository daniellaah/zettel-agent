import path from "node:path";
import { z } from "zod";
import type { AgentRun, AnswerItem } from "./agent-runner";
import { judgeInput } from "./answer-scoring";
import type { ModelExchange } from "./model-recording";
import { modelConfigSchema } from "./run-config";

export const sourceBindingSchema = z.object({
  corpusId: z.string().min(1),
  corpusHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceAuditSha256: z.string().regex(/^[a-f0-9]{64}$/),
  answersSha256: z.string().regex(/^[a-f0-9]{64}$/),
  implementation: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
export type SourceBinding = z.infer<typeof sourceBindingSchema>;

/** Judge-only runs cannot silently enable API calls or choose a model/rate. */
export function regradeConfig(env: Record<string, string | undefined>) {
  const mode = z.enum(["smoke", "live"]).parse(env.EVAL_MODE ?? "smoke");
  const sourceDirs = z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .parse(JSON.parse(env.EVAL_SOURCE_DIRS ?? "[]"));
  const maxRepairs = z.coerce
    .number()
    .int()
    .min(0)
    .max(2)
    .parse(env.EVAL_JUDGE_REPAIRS ?? "2");
  const ids = env.EVAL_IDS?.split(",").filter(Boolean) ?? [];
  const split = z.enum(["dev", "test"]).parse(env.EVAL_SPLIT ?? "dev");
  if (mode === "live" && env.EVAL_ALLOW_API !== "1")
    throw new Error("Live regrading requires EVAL_ALLOW_API=1");
  const live =
    mode === "live"
      ? {
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
  return { mode, sourceDirs, maxRepairs, ids, split, live };
}

/** Callers must resolve symlinks with realpath before applying this boundary. */
export function insideArtifacts(root: string, realPath: string): boolean {
  const relative = path.relative(root, realPath);
  return (
    !!relative &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Regrade the recorded answer/deliveries, never a changed corpus or a new agent trial. */
export function validateRegradeSource(
  item: AnswerItem,
  run: AgentRun,
  source: SourceBinding,
  expected: Omit<SourceBinding, "implementation">,
  originalJudgeInput: string,
  originalAgentExchanges: ModelExchange[] = [],
): string[] {
  const issues: string[] = [];
  for (const key of ["corpusId", "corpusHash", "sourceAuditSha256", "answersSha256"] as const)
    if (source[key] !== expected[key]) issues.push(`Source binding changed: ${key}`);
  if (run.itemId !== item.id || !Number.isInteger(run.trial) || run.trial < 1)
    issues.push("Source run identity is invalid");
  if (!["live", "scripted"].includes(run.mode))
    issues.push("Source must be an original live or smoke run");
  try {
    const currentInput = judgeInput(item, run);
    if (originalJudgeInput !== currentInput) {
      // The first pilot omitted zero-id/error tool results. Recover only outputs
      // also present verbatim in the recorded messages actually sent to the agent.
      const input = JSON.parse(currentInput) as {
        actualDeliveriesOnly: {
          callId: string;
          content: string;
          isError: boolean;
          exposures: unknown[];
        }[];
      };
      const additions = input.actualDeliveriesOnly.filter(
        (delivery) => delivery.isError || !delivery.exposures.length,
      );
      const observed = originalAgentExchanges.flatMap((exchange) =>
        exchange.request.messages.flatMap((message) =>
          message.role === "user"
            ? message.parts.filter((part) => part.type === "tool_result")
            : [],
        ),
      );
      const bound = additions.every((delivery) =>
        observed.some(
          (part) =>
            part.type === "tool_result" &&
            part.callId === delivery.callId &&
            part.content === delivery.content &&
            !!part.isError === delivery.isError,
        ),
      );
      const legacyInput = {
        ...input,
        actualDeliveriesOnly: input.actualDeliveriesOnly
          .filter((delivery) => !delivery.isError && delivery.exposures.length)
          .map(({ callId, content, exposures }) => ({ callId, content, exposures })),
      };
      if (!bound || originalJudgeInput !== JSON.stringify(legacyInput))
        issues.push("Source answer or deliveries differ from the recorded judge input");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Invalid source run");
  }
  return issues;
}
