import { z } from "zod";

/**
 * A compact file of named vectors: the magic "ZAV1", a little-endian uint32 header length,
 * a JSON header, padding to four bytes, then one little-endian float32 row per header key.
 */
const MAGIC = "ZAV1";

const headerSchema = z
  .object({
    embedder: z.string().min(1),
    dimensions: z.number().int().positive(),
    keys: z.array(z.string()),
    /** Free-form provenance, such as what the vectors were made from. */
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export interface VectorFile {
  embedder: string;
  dimensions: number;
  meta?: Record<string, unknown>;
  vectors: Map<string, Float32Array>;
}

export function encodeVectors(file: VectorFile): Uint8Array {
  const { embedder, dimensions, meta, vectors } = file;
  const keys = [...vectors.keys()];
  const json = new TextEncoder().encode(JSON.stringify({ embedder, dimensions, keys, meta }));
  const offset = align(8 + json.length);
  const bytes = new Uint8Array(offset + keys.length * dimensions * 4);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(MAGIC), 0);
  view.setUint32(4, json.length, true);
  bytes.set(json, 8);
  keys.forEach((key, row) => {
    const vector = vectors.get(key)!;
    if (vector.length !== dimensions)
      throw new Error(`Vector ${key} has ${vector.length} dimensions, not ${dimensions}.`);
    vector.forEach((value, i) => view.setFloat32(offset + (row * dimensions + i) * 4, value, true));
  });
  return bytes;
}

export function decodeVectors(bytes: Uint8Array): VectorFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC)
    throw new Error("Not a vector file.");
  const length = view.getUint32(4, true);
  if (8 + length > bytes.byteLength) throw new Error("Vector file header is truncated.");
  const header = headerSchema.parse(
    JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length))),
  );
  const { embedder, dimensions, keys, meta } = header;
  const offset = align(8 + length);
  if (bytes.byteLength !== offset + keys.length * dimensions * 4)
    throw new Error("Vector file size does not match its header.");
  const vectors = new Map<string, Float32Array>();
  keys.forEach((key, row) => {
    const vector = new Float32Array(dimensions);
    for (let i = 0; i < dimensions; i++)
      vector[i] = view.getFloat32(offset + (row * dimensions + i) * 4, true);
    vectors.set(key, vector);
  });
  return { embedder, dimensions, ...(meta && { meta }), vectors };
}

function align(offset: number): number {
  return Math.ceil(offset / 4) * 4;
}
