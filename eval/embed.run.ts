import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";

import { DEFAULT_EMBEDDING_MODEL } from "../src/retrieval/embedding-models";
import { OllamaEmbedder } from "../src/retrieval/ollama";
import { decodeVectors, encodeVectors } from "../src/retrieval/vector-file";
import { loadFixtureCorpus } from "./fixture-vault";
import { documentKey, evaluationQueries, queryKey, vectorFilePath } from "./vectors";

// Free but machine-dependent: run on demand with a local Ollama, then commit the file.
it("embeds the fixture corpus and every evaluation query with a local Ollama model", async () => {
  const model = process.env.EVAL_EMBED_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const embedder = await OllamaEmbedder.connect({
    model,
    ...(process.env.OLLAMA_URL && { baseUrl: process.env.OLLAMA_URL }),
  });
  const corpus = loadFixtureCorpus({ semantic: true });
  const sections = corpus.dense!.pending();
  const queries = evaluationQueries();

  // Keep vectors already made with the same embedder, so adding queries does not re-embed
  // (and slightly shift) every note.
  const file = vectorFilePath(model);
  const previous = existsSync(file) ? decodeVectors(readFileSync(file)) : null;
  const reusable: Map<string, Float32Array> =
    previous?.embedder === embedder.id ? previous.vectors : new Map<string, Float32Array>();
  const vectors = new Map<string, Float32Array>();
  const missingSections = sections.filter(({ key }) => {
    const vector = reusable.get(documentKey(key));
    if (vector) vectors.set(documentKey(key), vector);
    return !vector;
  });
  const missingQueries = queries.filter((query) => {
    const vector = reusable.get(queryKey(query));
    if (vector) vectors.set(queryKey(query), vector);
    return !vector;
  });

  let started = performance.now();
  const documents = await embedder.embed(
    missingSections.map((section) => section.text),
    "document",
  );
  const documentSeconds = (performance.now() - started) / 1000;
  started = performance.now();
  const queryVectors = await embedder.embed(missingQueries, "query");
  const querySeconds = (performance.now() - started) / 1000;
  missingSections.forEach(({ key }, i) => vectors.set(documentKey(key), documents[i]!));
  missingQueries.forEach((query, i) => vectors.set(queryKey(query), queryVectors[i]!));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    encodeVectors({
      embedder: embedder.id,
      dimensions: vectors.values().next().value!.length,
      meta: { model, digest: embedder.digest, sections: sections.length, queries: queries.length },
      vectors,
    }),
  );
  console.log(
    `${embedder.id}: embedded ${missingSections.length}/${sections.length} sections in ` +
      `${documentSeconds.toFixed(1)} s and ${missingQueries.length}/${queries.length} queries in ` +
      `${querySeconds.toFixed(1)} s → ${path.relative(process.cwd(), file)}`,
  );
}, 3_600_000);
