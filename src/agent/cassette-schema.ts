import { z } from "zod";
import type { Cassette } from "./recording";
const schema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  model: z.string(),
  question: z.string(),
  recordedAt: z.string(),
  binding: z
    .object({
      corpusRevision: z.string(),
      retrieval: z.enum(["bm25", "hybrid-local"]),
      reviewMode: z.string(),
    })
    .optional(),
  exchanges: z.array(
    z.object({
      url: z.string(),
      requestBody: z.unknown(),
      status: z.number().int().min(200).max(599),
      contentType: z.string(),
      body: z.string(),
    }),
  ),
});
export function parseCassette(value: unknown): Cassette {
  const cassette = schema.parse(value) as Cassette;
  if (!Number.isFinite(Date.parse(cassette.recordedAt)))
    throw new Error("Invalid recording timestamp.");
  if (cassette.version === 2 && !cassette.binding)
    throw new Error("V2 recording requires an evidence binding.");
  return cassette;
}
