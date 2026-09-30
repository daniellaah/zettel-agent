import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Scenario } from "./scenarios";
import type { AskResult } from "./types";

export interface ScenarioRecord {
  scenario: Scenario;
  result: AskResult;
}

const REPORT_DIR = path.join(import.meta.dirname, "reports");

/**
 * Share of expected notes the answer cited, or null for no-answer scenarios, where citing
 * nearby notes as "closest, but not it" is fine and the answer needs reading instead.
 */
export function expectedHitRate(record: ScenarioRecord): number | null {
  const { expect } = record.scenario;
  if (expect.length === 0) return null;
  return expect.filter((p) => record.result.citedPaths.includes(p)).length / expect.length;
}

/** Writes the full records as JSON and returns a Markdown summary table. */
export function writeReport(provider: string, model: string, records: ScenarioRecord[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${stamp}-${provider}.json`);
  writeFileSync(file, `${JSON.stringify({ provider, model, records }, null, 2)}\n`);

  const rows = records.map((record) => {
    const { result, scenario } = record;
    const usage = result.usage;
    return [
      scenario.id,
      result.stop ?? "-",
      formatRate(expectedHitRate(record)),
      String(result.tools.length),
      String(result.unknownCitations.length),
      usage ? `${usage.inputTokens + usage.cacheReadTokens}/${usage.outputTokens}` : "-",
      `${Math.round(result.seconds)}s`,
    ];
  });
  const rates = records.map(expectedHitRate).filter((rate): rate is number => rate !== null);
  const hitRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const header = [
    "scenario",
    "stop",
    "expected cited",
    "tools",
    "bad cites",
    "tokens in/out",
    "time",
  ];
  return [
    `\n### ${provider} · ${model}\n`,
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    `\nMean expected-note hit rate: ${formatRate(hitRate)} (n/a = no-answer scenario; read the answer). Full records: ${path.relative(process.cwd(), file)}`,
  ].join("\n");
}

function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
}
