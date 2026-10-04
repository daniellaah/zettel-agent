import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

import { DEFAULT_EMBEDDING_MODEL, OllamaEmbedder } from "../src/retrieval/ollama";
import { encodeVectors } from "../src/retrieval/vector-file";
import { loadEvaluationData, loadFixtureCorpus } from "./fixture-vault";
import { documentKey, evaluationQueries, queryKey, vectorFilePath } from "./vectors";

// Free but machine-dependent: run on demand with a local Ollama, then commit the file.
it("embeds the fixture corpus and every evaluation query with a local Ollama model", async () => {
  const model = process.env.EVAL_EMBED_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const embedder = await OllamaEmbedder.connect({
    model,
    ...(process.env.OLLAMA_URL && { baseUrl: process.env.OLLAMA_URL }),
  });
  // Only the frozen corpus: a note added to the sample vault later is not evaluation data.
  const frozen = new Set(loadEvaluationData().manifest.notes.map((note) => note.path));
  const corpus = loadFixtureCorpus("both", { semantic: true });
  for (const note of corpus.paths()) if (!frozen.has(note)) corpus.remove(note);
  const sections = corpus.dense!.pending();
  const queries = evaluationQueries();

  let started = performance.now();
  const documents = await embedder.embed(
    sections.map((section) => section.text),
    "document",
  );
  const documentSeconds = (performance.now() - started) / 1000;
  started = performance.now();
  const queryVectors = await embedder.embed(queries, "query");
  const querySeconds = (performance.now() - started) / 1000;

  const vectors = new Map<string, Float32Array>();
  sections.forEach(({ key }, i) => vectors.set(documentKey(key), documents[i]!));
  queries.forEach((query, i) => vectors.set(queryKey(query), queryVectors[i]!));
  const file = vectorFilePath(model);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    encodeVectors({
      embedder: embedder.id,
      dimensions: documents[0]!.length,
      meta: { model, digest: embedder.digest, sections: sections.length, queries: queries.length },
      vectors,
    }),
  );
  console.log(
    `${embedder.id}: ${sections.length} sections in ${documentSeconds.toFixed(1)} s ` +
      `(${(sections.length / documentSeconds).toFixed(1)}/s), ${queries.length} queries in ` +
      `${querySeconds.toFixed(1)} s → ${path.relative(process.cwd(), file)}`,
  );
}, 3_600_000);
