import path from "node:path";

/** New retrieval runs never overwrite the frozen historical report directory. */
export function reportDestination(evalDir: string, requested?: string): string {
  const historical = path.resolve(evalDir, "reports");
  const destination = requested ? path.resolve(requested) : path.join(historical, "tool-v2");
  if (destination === historical || historical.startsWith(`${destination}${path.sep}`))
    throw new Error(
      "EVAL_REPORT_DIR must be a new versioned directory, not historical reports or their parent.",
    );
  return destination;
}
