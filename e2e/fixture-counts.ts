import path from "node:path";

import { frozenPaths } from "../eval/fixture-vault";

/** What the plugin should index in the sample vault: the frozen evaluation notes, by stage folder. */
export function fixtureNoteCounts(): { notes: number; stages: Record<string, number> } {
  const stages: Record<string, number> = {};
  for (const file of frozenPaths()) {
    const stage = path.basename(path.dirname(file)).toLowerCase();
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  return { notes: Object.values(stages).reduce((sum, count) => sum + count, 0), stages };
}
