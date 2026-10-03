import { expect, it } from "vitest";
import { pairedBootstrap } from "./paired-bootstrap";
it("reports paired clustered intervals with measured denominators and null exclusions", () => {
  const constant = pairedBootstrap([
    { group: "source-a", lexical: 0.3, hybrid: 0.5 },
    { group: "source-a", lexical: 0.3, hybrid: 0.5 },
    { group: "source-b", lexical: null, hybrid: null },
  ]);
  expect(constant.pairs).toBe(2);
  expect(constant.clusters).toBe(1);
  expect(constant.delta).toBeCloseTo(0.2);
  expect(constant.ci95![0]).toBeCloseTo(0.2);
  const varied = [
    { group: "a", lexical: 0, hybrid: 1 },
    { group: "b", lexical: 1, hybrid: 0 },
  ];
  expect(pairedBootstrap(varied).ci95).toEqual([-1, 1]);
  expect(pairedBootstrap(varied)).toEqual(pairedBootstrap(varied));
  expect(pairedBootstrap([]).ci95).toBeNull();
  expect(() => pairedBootstrap(varied, 0)).toThrow();
  expect(() => pairedBootstrap([{ group: "a", lexical: NaN, hybrid: 1 }])).toThrow();
});
