import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { loadFixtureCorpus, VAULT_DIR } from "./fixture-vault";
import { OllamaEmbeddingProvider, QUERY_INSTRUCTION } from "../src/retrieval/ollama";
import { LOCAL_HYBRID_WEIGHTS } from "../src/retrieval/local-search";
import { encode, ExactVectorIndex } from "../src/retrieval/vector";
import { localOllamaFetch } from "../src/vault/local-http";
import { FileEmbeddingCache } from "../src/vault/embedding-cache";
import {
  CachedEmbeddingProvider,
  compareRetrievers,
  evaluateReviewedPool,
  experimentBinding,
  type ReviewedPool,
  type ExperimentRanking,
} from "./vector-experiment";
import {
  LOCAL_REVIEW_PROMPT,
  localReviewSchema,
  reviewPayload,
  validateLocalReview,
  type ReviewDocument,
} from "./local-pool-review";
import { assembleReviewedLabels, summarizeQualityVariants } from "./local-quality-scoring";
import { format, resolveConfig } from "prettier";

const suite = path.join(import.meta.dirname, "suites/local-hybrid-v1");
const artifacts = path.join(import.meta.dirname, "artifacts/local-hybrid-quality-v1");
const reports = path.join(import.meta.dirname, "reports/local-hybrid-quality-v1");
const querySchema = z.object({
  schema: z.literal(1),
  items: z.array(
    z.object({
      id: z.string(),
      family: z.string(),
      query: z.string(),
      slice: z.enum(["exact-term", "paraphrase", "cross-language"]),
      lang: z.enum(["en", "zh"]),
      split: z.enum(["dev", "final"]),
      answerability: z.enum(["answerable", "no-answer"]),
      sourceQuery: z.string().nullable(),
    }),
  ),
});
type QualityQuery = z.infer<typeof querySchema>["items"][number];
type PoolItem = { query: QualityQuery; documents: ReviewDocument[] };
type VariantResults = { id: string; weights: number[]; rankings: ExperimentRanking[] };
const protocolSchema = z
  .object({
    version: z.string(),
    variants: z.array(z.object({ id: z.string(), weights: z.array(z.number()) })),
  })
  .passthrough();
const resultSchema = z.object({
  model: z.string(),
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});
const reviewBatchSchema = z.object({
  queryId: z.string(),
  batch: z.number(),
  model: z.string(),
  modelDigest: z.string(),
  promptHash: z.string(),
  inputHash: z.string(),
  attempts: z.array(z.object({ response: resultSchema, invalid: z.string().nullable() })),
  judgments: localReviewSchema.shape.judgments,
});

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
async function save(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    await format(JSON.stringify(value), { ...(await resolveConfig(file)), parser: "json" }),
  );
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

it("runs staged local-only retrieval quality review, tuning and a frozen final checkpoint", async () => {
  const stage = process.env.EVAL_LOCAL_STAGE ?? "prepare";
  const protocol = protocolSchema.parse(await json(path.join(suite, "protocol.json")));
  const freeze = z
    .object({ files: z.record(z.string(), z.string()) })
    .parse(await json(path.join(suite, "freeze.json")));
  for (const [file, hash] of Object.entries(freeze.files))
    expect(sha(await readFile(path.join(suite, file), "utf8"))).toBe(hash);
  const corpus = loadFixtureCorpus();
  await mkdir(artifacts, { recursive: true });
  await mkdir(reports, { recursive: true });
  const queries = querySchema.parse(
    await json(
      path.join(
        suite,
        stage === "final" || stage === "review-final" || stage === "score-final"
          ? "final.json"
          : "dev.json",
      ),
    ),
  ).items;
  const phase = stage.includes("final") ? "final" : "dev";

  if (stage === "prepare" || stage === "final") {
    if (stage === "prepare") {
      try {
        await readFile(path.join(reports, "dev-labels.json"));
        throw new Error(
          "Development labels already frozen; use saved rankings or create a new suite version",
        );
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    if (stage === "final") {
      const selected = z
        .object({
          selected: z.string(),
          devLabelHash: z.string(),
          frozenSuite: z.record(z.string(), z.string()),
        })
        .parse(await json(path.join(reports, "selection.json")));
      expect(selected.devLabelHash).toBe(
        sha(await readFile(path.join(reports, "dev-labels.json"), "utf8")),
      );
      expect(selected.frozenSuite).toEqual(freeze.files);
      // Never dispatch a second held-out checkpoint from an already observed suite.
      try {
        await readFile(path.join(artifacts, "final-rankings.json"));
        throw new Error(
          "Final checkpoint already run; replay saved results rather than tuning or redispatching",
        );
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    const provider = await OllamaEmbeddingProvider.connect(
      "http://127.0.0.1:11434",
      localOllamaFetch,
    );
    const cache = await FileEmbeddingCache.open(path.join(artifacts, "vectors"), VAULT_DIR);
    const index = new ExactVectorIndex(provider.config);
    const accounting = await index.rebuild(corpus, provider, cache);
    const vectors: { input: string; vector: number[] }[] = [];
    let inputTokens: number | null = 0;
    const queryBatchSize = stage === "final" ? 1 : 8;
    const queryLatencyMs: number[] = [];
    for (let i = 0; i < queries.length; i += queryBatchSize) {
      const batch = queries.slice(i, i + queryBatchSize);
      const started = performance.now();
      const encoded = await encode(
        provider,
        batch.map((q) => QUERY_INSTRUCTION + q.query),
      );
      queryLatencyMs.push(performance.now() - started);
      inputTokens =
        inputTokens === null || encoded.usage.inputTokens === null
          ? null
          : inputTokens + encoded.usage.inputTokens;
      batch.forEach((q, j) => vectors.push({ input: q.query, vector: encoded.vectors[j]! }));
    }
    await save(path.join(artifacts, `${phase}-query-vectors.json`), {
      model: provider.config,
      vectors,
    });
    const offline = new CachedEmbeddingProvider(provider.config, vectors);
    const selectedId =
      stage === "final"
        ? z.object({ selected: z.string() }).parse(await json(path.join(reports, "selection.json")))
            .selected
        : null;
    const variants = selectedId
      ? protocol.variants.filter((variant) => variant.id === selectedId)
      : protocol.variants;
    if (stage === "final") {
      expect(variants).toHaveLength(1);
      expect(variants[0]!.weights).toEqual(LOCAL_HYBRID_WEIGHTS);
    }
    const results: VariantResults[] = [];
    for (const variant of variants)
      results.push({
        ...variant,
        rankings: await compareRetrievers(
          corpus,
          index,
          offline,
          queries,
          undefined,
          5,
          variant.weights,
        ),
      });
    const original = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            judgments: z.record(z.string(), z.object({ grade: z.number() })),
          }),
        ),
      })
      .parse(await json(path.join(import.meta.dirname, "suites/expanded/retrieval.json")));
    const anchors =
      stage === "final"
        ? z
            .object({ items: z.array(z.object({ id: z.string(), path: z.string() })) })
            .parse(await json(path.join(suite, "final-anchors.json"))).items
        : [];
    const pool: PoolItem[] = queries.map((query, n) => {
      const candidates = new Set(
        results.flatMap((variant) =>
          Object.values(variant.rankings[n]!.rankings).flatMap((hits) =>
            hits.map((hit) => hit.path),
          ),
        ),
      );
      const source = original.items.find((q) => q.id === query.sourceQuery);
      if (source)
        Object.entries(source.judgments)
          .filter(([, judgment]) => judgment.grade > 0)
          .forEach(([file]) => candidates.add(file));
      const anchor = anchors.find((a) => a.id === query.id);
      if (anchor) {
        candidates.add(anchor.path);
        corpus
          .graph()
          .outlinks(anchor.path)
          .forEach((file) => candidates.add(file));
      }
      return {
        query,
        documents: [...candidates].sort().map((file, i) => ({
          id: `n${i}`,
          path: file,
          text: corpus
            .get(file)!
            .sections.map((section) => section.text)
            .join("\n"),
        })),
      };
    });
    await save(path.join(artifacts, `${phase}-rankings.json`), {
      model: provider.config,
      corpusRevision: corpus.revision,
      frozenSuite: freeze.files,
      protocol,
      indexing: accounting,
      queryUsage: {
        requests: Math.ceil(queries.length / queryBatchSize),
        batchSize: queryBatchSize,
        inputTokens,
        usd: 0,
        batchLatencyMs: queryLatencyMs,
      },
      results,
    });
    await save(path.join(artifacts, `${phase}-pool.json`), pool);
    console.log(
      `${phase}: ${queries.length} queries, ${pool.reduce((sum, row) => sum + row.documents.length, 0)} pooled candidate reviews; local embedding USD=0`,
    );
    return;
  }
  const pool = z
    .array(
      z.object({
        query: querySchema.shape.items.element,
        documents: z.array(z.object({ id: z.string(), path: z.string(), text: z.string() })),
      }),
    )
    .parse(await json(path.join(artifacts, `${phase}-pool.json`)));
  for (const row of pool)
    for (const doc of row.documents)
      expect(doc.text).toBe(
        corpus
          .get(doc.path)
          ?.sections.map((section) => section.text)
          .join("\n"),
      );
  if (stage === "review" || stage === "review-final") {
    const model = "gemma2:2b";
    const tags = z
      .object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) })
      .parse(await (await fetch("http://127.0.0.1:11434/api/tags")).json());
    const digest = tags.models.find((m) => m.name === model)?.digest;
    if (!digest) throw new Error("Local review model unavailable; no paid fallback");
    let newBatches = 0;
    for (const [n, row] of pool.entries()) {
      for (let offset = 0; offset < row.documents.length; offset += 6) {
        const batch = row.documents.slice(offset, offset + 6);
        const payload = reviewPayload(row.query.query, batch);
        const file = path.join(artifacts, "reviews", `${phase}-${row.query.id}-${offset}.json`);
        try {
          const saved = reviewBatchSchema.parse(await json(file));
          if (
            saved.modelDigest !== digest ||
            saved.promptHash !== sha(LOCAL_REVIEW_PROMPT) ||
            saved.inputHash !== sha(payload)
          )
            throw new Error("Review checkpoint identity mismatch");
          validateLocalReview({ judgments: saved.judgments }, batch);
          continue;
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        const attempts: z.infer<typeof reviewBatchSchema>["attempts"] = [];
        let judgments: z.infer<typeof localReviewSchema>["judgments"] | undefined;
        for (let attempt = 0; attempt < 3 && !judgments; attempt++) {
          const response = await fetch("http://127.0.0.1:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(120_000),
            body: JSON.stringify({
              model,
              stream: false,
              format: z.toJSONSchema(localReviewSchema),
              keep_alive: "5m",
              options: { temperature: 0, seed: 42, num_ctx: 8192, num_predict: 1600 },
              messages: [
                { role: "system", content: LOCAL_REVIEW_PROMPT },
                {
                  role: "user",
                  content:
                    payload +
                    (attempt
                      ? "\nPrevious response failed exact quote or complete id validation. Return every id and copy exact body quotes, or grade 0 with empty quote if irrelevant."
                      : ""),
                },
              ],
            }),
          });
          if (!response.ok) throw new Error(`Local review HTTP ${response.status}; no fallback`);
          const parsed = resultSchema.parse(await response.json());
          let invalid: string | null = null;
          try {
            if (parsed.done_reason === "length") throw new Error("Truncated review");
            judgments = validateLocalReview(JSON.parse(parsed.message.content), batch);
          } catch (error) {
            invalid = error instanceof Error ? error.message : "Invalid review";
          }
          attempts.push({ response: parsed, invalid });
        }
        if (!judgments) {
          await save(file + ".failed", { attempts });
          throw new Error(
            `Incomplete review ${row.query.id}/${offset}; no unknown-to-zero conversion`,
          );
        }
        await save(file, {
          queryId: row.query.id,
          batch: offset,
          model,
          modelDigest: digest,
          promptHash: sha(LOCAL_REVIEW_PROMPT),
          inputHash: sha(payload),
          attempts,
          judgments,
        });
        newBatches++;
      }
      if (n % 5 === 0 || n === pool.length - 1)
        console.log(`${phase} local review ${n + 1}/${pool.length}; ${newBatches} new batches`);
    }
    return;
  }
  if (stage !== "score" && stage !== "score-final") throw new Error("Unknown local quality stage");
  const sourceReviewFile = path.join(artifacts, `${phase}-source-review.json`);
  const review = z
    .object({
      version: z.string(),
      poolHash: z.string(),
      labelType: z.string(),
      reviewedAt: z.string(),
      uniqueBodiesRead: z.number(),
      candidateAssignments: z.number(),
      failedLocalModelsExcluded: z.literal(true),
      rows: z.array(
        z.object({
          id: z.string(),
          query: z.string(),
          reviewer: z.literal("Codex-source-review"),
          documents: z.array(z.object({ id: z.string(), path: z.string(), text: z.string() })),
          judgments: localReviewSchema.shape.judgments,
        }),
      ),
    })
    .parse(await json(sourceReviewFile));
  expect(review.poolHash).toBe(
    sha(await readFile(path.join(artifacts, `${phase}-pool.json`), "utf8")),
  );
  expect(review.rows.map(({ id, query, documents }) => ({ id, query, documents }))).toEqual(
    pool.map((row) => ({ id: row.query.id, query: row.query.query, documents: row.documents })),
  );
  expect(review.candidateAssignments).toBe(
    pool.reduce((sum, row) => sum + row.documents.length, 0),
  );
  expect(review.uniqueBodiesRead).toBe(
    new Set(pool.flatMap((row) => row.documents.map((d) => d.path))).size,
  );
  const reviewed = assembleReviewedLabels(review.rows, []);
  const data = z
    .object({
      corpusRevision: z.string(),
      frozenSuite: z.record(z.string(), z.string()),
      results: z.array(
        z.object({ id: z.string(), weights: z.array(z.number()), rankings: z.array(z.unknown()) }),
      ),
    })
    .parse(await json(path.join(artifacts, `${phase}-rankings.json`)));
  expect(data.corpusRevision).toBe(corpus.revision);
  expect(data.frozenSuite).toEqual(freeze.files);
  const variants = data.results as VariantResults[];
  if (phase === "final") {
    expect(variants).toHaveLength(1);
    expect(variants[0]!.weights).toEqual(LOCAL_HYBRID_WEIGHTS);
  }
  const labels: ReviewedPool = {
    version: review.version,
    reviewer: "ai",
    frozen: true,
    corpusRevision: corpus.revision,
    protocolVersion: protocol.version,
    queryBinding: experimentBinding(variants[0]!.rankings),
    judgments: reviewed.judgments,
  };
  const labelFile = path.join(reports, `${phase}-labels.json`);
  // Label identity becomes immutable before any score is inspected.
  const serialized = await format(JSON.stringify(labels), {
    ...(await resolveConfig(labelFile)),
    parser: "json",
  });
  try {
    expect(await readFile(labelFile, "utf8")).toBe(serialized);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    await writeFile(labelFile, serialized);
  }
  await save(path.join(reports, `${phase}-review.json`), {
    version: review.version,
    labelType: review.labelType,
    reviewedAt: review.reviewedAt,
    sourceReviewHash: sha(await readFile(sourceReviewFile, "utf8")),
    poolHash: review.poolHash,
    uniqueBodiesRead: review.uniqueBodiesRead,
    candidateAssignments: review.candidateAssignments,
    failedLocalModelsExcluded: true,
    details: reviewed.details,
  });
  const summary =
    phase === "dev"
      ? summarizeQualityVariants(variants, labels, corpus.revision, protocol.version)
      : {
          rows: variants.map((variant) => ({
            ...variant,
            evaluation: evaluateReviewedPool(
              variant.rankings,
              labels,
              corpus.revision,
              true,
              protocol.version,
            ),
          })),
          selected: variants[0]!.id,
          gatePassed: null,
          decision:
            "Fixed development-selected variant; no final exact-term slice, so the complete gate is unavailable. No selection or tuning on final outcomes.",
        };
  const languageRows = ["en", "zh"].map((lang) => ({
    lang,
    variants: variants.map((variant) => {
      const rankings = variant.rankings.filter(
        (row) => queries.find((q) => q.id === row.id)!.lang === lang,
      );
      const languagePool = { ...labels, queryBinding: experimentBinding(rankings) };
      return {
        id: variant.id,
        weights: variant.weights,
        evaluation: evaluateReviewedPool(
          rankings,
          languagePool,
          corpus.revision,
          true,
          protocol.version,
        ),
      };
    }),
  }));
  await save(path.join(reports, `${phase}-quality.json`), {
    frozenSuite: freeze.files,
    labelHash: sha(await readFile(labelFile, "utf8")),
    summary,
    languages: languageRows,
    finalLimitation:
      phase === "final"
        ? "Synthetic source-aware checkpoint; no exact-term final slice, so reuse development exact-slice guardrail and report the final gate as unavailable, not passed."
        : null,
  });
  if (phase === "dev")
    await save(path.join(reports, "selection.json"), {
      selected: summary.selected,
      weights: protocol.variants.find((variant) => variant.id === summary.selected)!.weights,
      gatePassed: summary.gatePassed,
      devLabelHash: sha(await readFile(labelFile, "utf8")),
      frozenSuite: freeze.files,
      paidAnswerEvaluation: "deferred by user; no default promotion",
    });
  for (const row of summary.rows)
    console.log(
      JSON.stringify({
        id: row.id,
        lexical: row.evaluation.lexical,
        dense: row.evaluation.dense,
        hybrid: row.evaluation.hybrid,
        gate: row.evaluation.retrievalGate,
      }),
    );
  console.log(
    `${phase} selected=${summary.selected}; all labels frozen before scoring; paid/default promotion deferred`,
  );
}, 3_600_000);
