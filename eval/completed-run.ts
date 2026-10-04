import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { GradedRun } from "./agent-report";
import type { Judgment } from "./answer-scoring";
import type { PlannedJob } from "./full-plan";
import type { ModelExchange } from "./model-recording";
import { sha256 } from "./validate";

const ref = z.object({ path: z.string(), sha256: z.string() });
type Ref = z.infer<typeof ref>;

/** Who graded the run: the configured judge model, a disclosed AI repair of a failed grade, or nobody. */
export type GradingSource = "model" | "ai-repair" | "none";

export interface CompletedJob {
  job: PlannedJob;
  record: GradedRun;
  exchanges: ModelExchange[];
  grading: GradingSource;
}

/**
 * Annotation hashes a full-evaluation report was bound to. Continuation and finishing phases
 * nest the original binding under `parent` and `original`.
 */
export function annotationHashes(binding: unknown): {
  answersSha256: string;
  robustnessSha256: string;
} {
  let current = binding;
  while (current && typeof current === "object" && !("answersSha256" in current))
    current =
      (current as { parent?: unknown; original?: unknown }).parent ??
      (current as { original?: unknown }).original;
  return z.object({ answersSha256: z.string(), robustnessSha256: z.string() }).parse(current);
}

/**
 * Reads the final records of a completed full-evaluation directory. Each job's model steps come
 * from the recording its result inherits, and a failed grade is replaced by its validated AI
 * repair when one exists. Every file read stays under `artifacts`, and every inherited file
 * must match its recorded hash. Jobs without a result are returned as missing.
 */
export function readCompletedRun(
  dir: string,
  artifacts: string,
  plan: PlannedJob[],
): { jobs: CompletedJob[]; missing: string[] } {
  const read = (file: string) => {
    if (!path.resolve(file).startsWith(`${path.resolve(artifacts)}/`))
      throw new Error(`Outside the evaluation artifacts: ${file}`);
    return readFileSync(file, "utf8");
  };
  const checked = (inherited: Ref) => {
    if (sha256(read(inherited.path)) !== inherited.sha256)
      throw new Error(`Inherited file changed: ${inherited.path}`);
    return inherited.path;
  };
  const recordingFor = (resultFile: string) => {
    const visited = new Set<string>();
    for (let file = resultFile; ;) {
      if (visited.has(file)) throw new Error("Cyclic result inheritance");
      visited.add(file);
      const cassette = file.replace(/-result\.json$/, "-recording.json");
      if (existsSync(cassette)) return cassette;
      const inherited = (JSON.parse(read(file)) as { inherited?: unknown }).inherited;
      if (!inherited) throw new Error(`No recording for ${path.basename(resultFile)}`);
      file = checked(ref.parse(inherited));
    }
  };
  const agentExchanges = (file: string): ModelExchange[] => {
    const visited = new Set<string>();
    let recording = JSON.parse(read(file)) as {
      agent: ModelExchange[];
      inheritedAgent?: Ref | null;
    };
    while (recording.inheritedAgent) {
      const next = checked(ref.parse(recording.inheritedAgent));
      if (visited.has(next)) throw new Error("Cyclic recording inheritance");
      visited.add(next);
      recording = JSON.parse(read(next)) as typeof recording;
    }
    return recording.agent;
  };
  const jobs: CompletedJob[] = [];
  const missing: string[] = [];
  for (const job of plan) {
    const file = path.join(dir, `${job.name}-result.json`);
    if (!existsSync(file)) {
      missing.push(job.name);
      continue;
    }
    let { record } = JSON.parse(read(file)) as { record: GradedRun };
    let grading: GradingSource = record.judgment ? "model" : "none";
    const repair = path.join(dir, "ai-recovery", "validated", `${job.name}.json`);
    if (!record.judgment && existsSync(repair)) {
      const { judgment } = JSON.parse(read(repair)) as { judgment: Judgment };
      record = { ...record, judgment, gradingError: null };
      grading = "ai-repair";
    }
    jobs.push({ job, record, exchanges: agentExchanges(recordingFor(file)), grading });
  }
  return { jobs, missing };
}
