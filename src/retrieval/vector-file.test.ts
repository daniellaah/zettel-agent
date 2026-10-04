import { describe, expect, it } from "vitest";

import { decodeVectors, encodeVectors } from "./vector-file";

describe("vector files", () => {
  it("round-trips keys, values and provenance", () => {
    const vectors = new Map([
      ["k1", Float32Array.from([0.5, -0.25, 1])],
      ["k2", Float32Array.from([0, 0.125, -1])],
    ]);
    const bytes = encodeVectors({ embedder: "fake", dimensions: 3, meta: { note: "é" }, vectors });
    const decoded = decodeVectors(bytes);
    expect(decoded.embedder).toBe("fake");
    expect(decoded.dimensions).toBe(3);
    expect(decoded.meta).toEqual({ note: "é" });
    expect([...decoded.vectors.keys()]).toEqual(["k1", "k2"]);
    expect([...decoded.vectors.get("k2")!]).toEqual([0, 0.125, -1]);
  });

  it("decodes from an offset view and rejects damaged files", () => {
    const bytes = encodeVectors({
      embedder: "fake",
      dimensions: 1,
      vectors: new Map([["k", Float32Array.from([2])]]),
    });
    const shifted = new Uint8Array(bytes.length + 3);
    shifted.set(bytes, 3);
    expect([...decodeVectors(shifted.subarray(3)).vectors.get("k")!]).toEqual([2]);
    expect(() => decodeVectors(bytes.subarray(0, bytes.length - 1))).toThrow("does not match");
    expect(() => decodeVectors(new TextEncoder().encode("nope, not vectors"))).toThrow(
      "Not a vector file",
    );
    expect(() =>
      encodeVectors({
        embedder: "x",
        dimensions: 2,
        vectors: new Map([["k", new Float32Array(3)]]),
      }),
    ).toThrow("3 dimensions, not 2");
  });
});
