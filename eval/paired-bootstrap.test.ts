import { expect, it } from "vitest";
import { pairedBootstrap } from "./paired-bootstrap";
it("reports paired clustered intervals with measured denominators and null exclusions", () => {
  const constant = pairedBootstrap([
    { group: "source-a", baseline: 0.3, candidate: 0.5 },
    { group: "source-a", baseline: 0.3, candidate: 0.5 },
    { group: "source-b", baseline: null, candidate: null },
  ]);
  expect(constant.pairs).toBe(2);
  expect(constant.clusters).toBe(1);
  expect(constant.delta).toBeCloseTo(0.2);
  expect(constant.ci95![0]).toBeCloseTo(0.2);
  const varied = [
    { group: "a", baseline: 0, candidate: 1 },
    { group: "b", baseline: 1, candidate: 0 },
  ];
  expect(pairedBootstrap(varied).ci95).toEqual([-1, 1]);
  expect(pairedBootstrap(varied)).toEqual(pairedBootstrap(varied));
  expect(pairedBootstrap([]).ci95).toBeNull();
  expect(() => pairedBootstrap(varied, 0)).toThrow();
  expect(() => pairedBootstrap([{ group: "a", baseline: NaN, candidate: 1 }])).toThrow();
});
