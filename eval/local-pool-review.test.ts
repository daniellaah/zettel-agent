import { expect, it } from "vitest";
import { reviewPayload, validateLocalReview } from "./local-pool-review";
it("hides paths and retrieval identities from the review payload", () => {
  const payload = reviewPayload("q", [{ id: "n1", path: "secret.md", text: "source body" }]);
  expect(payload).not.toContain("secret");
  expect(() => reviewPayload("", [])).toThrow();
  expect(() =>
    reviewPayload("q", [
      { id: "n", path: "a", text: "a" },
      { id: "n", path: "b", text: "b" },
    ]),
  ).toThrow("Unique");
});
it("requires complete unique review labels and exact positive support", () => {
  const docs = [{ id: "n1", path: "a", text: "The body contains direct evidence for the answer." }];
  const judgment = {
    id: "n1",
    grade: 2,
    rationale: "Direct supporting evidence.",
    quote: docs[0]!.text,
  };
  expect(validateLocalReview({ judgments: [judgment] }, docs)).toEqual([judgment]);
  expect(() => validateLocalReview({ judgments: [] }, docs)).toThrow("Incomplete");
  expect(() => validateLocalReview({ judgments: [judgment, judgment] }, docs)).toThrow("duplicate");
  expect(() =>
    validateLocalReview(
      { judgments: [{ ...judgment, quote: "A fabricated sentence here." }] },
      docs,
    ),
  ).toThrow("exact");
  expect(() => validateLocalReview({ judgments: [{ ...judgment, grade: 0 }] }, docs)).toThrow(
    "Negative",
  );
});
