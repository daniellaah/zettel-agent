/** HTTP-level accounting for the bounded first-release smoke only. No SDK retries. */
export interface Attempt {
  scenario: string;
  inputBytes: number;
  status: number | null;
  usage: { input: number; output: number; cache: number } | null;
  accountedUsd: number;
  outcome: "pending" | "complete" | "unknown";
}
export class ReleaseAllowance {
  readonly attempts: Attempt[] = [];
  constructor(
    readonly maxUsd = 5,
    readonly maxRequests = 120,
  ) {}
  get accountedUsd(): number {
    return this.attempts.reduce((sum, a) => sum + a.accountedUsd, 0);
  }
  begin(scenario: string, body: string): Attempt {
    const bytes = new TextEncoder().encode(body).length;
    const data = JSON.parse(body) as { max_tokens?: number; model?: string };
    if (
      bytes > 65_536 ||
      data.max_tokens !== 8192 ||
      !["deepseek-flash", "zettel-release-invalid-model"].includes(data.model ?? "")
    )
      throw new Error("Release request input, output or model exceeds the frozen allowance.");
    if (this.attempts.filter((a) => a.scenario === scenario).length >= 10)
      throw new Error("Per-scenario HTTP request limit reached.");
    // One token per encoded input byte plus 4096 framing tokens, all cache misses,
    // maximum output; peak rates. Unknown/aborted/failed use keeps the full reservation.
    const reserve = ((bytes + 4096) * 0.3 + 8192 * 1.2) / 1_000_000;
    if (this.attempts.length >= this.maxRequests || this.accountedUsd + reserve > this.maxUsd)
      throw new Error("Release paid allowance exhausted before dispatch.");
    const attempt: Attempt = {
      scenario,
      inputBytes: bytes,
      status: null,
      usage: null,
      accountedUsd: reserve,
      outcome: "pending",
    };
    this.attempts.push(attempt);
    return attempt;
  }
  finish(attempt: Attempt, status: number | null, raw: string | null): void {
    attempt.status = status;
    attempt.outcome = "unknown";
    if (!raw || status !== 200) return;
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as {
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            prompt_cache_hit_tokens?: number;
          };
        };
        const usage = chunk.usage;
        if (!usage) continue;
        const cache = usage.prompt_cache_hit_tokens ?? 0;
        if (
          ![usage.prompt_tokens, usage.completion_tokens, cache].every(
            (n) => Number.isInteger(n) && n >= 0,
          ) ||
          cache > usage.prompt_tokens
        )
          continue;
        attempt.usage = {
          input: usage.prompt_tokens - cache,
          output: usage.completion_tokens,
          cache,
        };
        attempt.accountedUsd =
          ((usage.prompt_tokens - cache) * 0.3 + cache * 0.006 + usage.completion_tokens * 1.2) /
          1_000_000;
        attempt.outcome = "complete";
      } catch {
        /* Incomplete SSE lines retain a conservative unknown reservation. */
      }
    }
  }
}
