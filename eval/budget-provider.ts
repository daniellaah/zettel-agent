import type { ModelProvider, ModelRequest, StreamHandlers } from "../src/agent/provider";
import { tokenCost, type TokenRates } from "./answer-scoring";

export interface SpendingAllowance {
  limitUsd: number;
  accountedUsd: number;
  calls: number;
  maxCalls: number;
}

/** Conservative preflight estimate. Provider billing/fallbacks remain authoritative. */
export function requestReserve(request: ModelRequest, rates: TokenRates): number {
  const inputUpperEstimate = new TextEncoder().encode(JSON.stringify(request)).length + 4096;
  return tokenCost(
    {
      inputTokens: inputUpperEstimate,
      outputTokens: 32_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    { ...rates, input: Math.max(rates.input, rates.cacheRead, rates.cacheWrite) },
  )!;
}

export class BudgetProvider implements ModelProvider {
  constructor(
    private readonly inner: ModelProvider,
    private readonly rates: TokenRates,
    private readonly allowance: SpendingAllowance,
  ) {
    if (
      !Number.isFinite(allowance.limitUsd) ||
      allowance.limitUsd <= 0 ||
      allowance.maxCalls < 1 ||
      !Number.isInteger(allowance.maxCalls)
    )
      throw new Error("Invalid API spending allowance");
  }
  get provider() {
    return this.inner.provider;
  }
  get model() {
    return this.inner.model;
  }
  async send(request: ModelRequest, handlers: StreamHandlers, signal?: AbortSignal) {
    const reserve = requestReserve(request, this.rates);
    if (
      this.allowance.calls >= this.allowance.maxCalls ||
      this.allowance.accountedUsd + reserve > this.allowance.limitUsd
    )
      throw new Error("Evaluation API allowance exhausted before the next request");
    this.allowance.calls++;
    this.allowance.accountedUsd += reserve;
    // On a failed/aborted request retain the reservation because billable usage is unknown.
    const response = await this.inner.send(request, handlers, signal);
    const actual = tokenCost(response.usage, this.rates)!;
    this.allowance.accountedUsd += actual - reserve;
    return response;
  }
  describeError(error: unknown) {
    return this.inner.describeError(error);
  }
}
