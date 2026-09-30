import { describe, expect, it } from "vitest";

import { citationsToHtml } from "./citation-markup";

describe("citationsToHtml", () => {
  it("turns citations into chips, one per id", () => {
    expect(citationsToHtml("A **b** [E3]，见 [E1, E12]。")).toBe(
      'A **b** <span class="za-cite za-cite-E3">3</span>，见 <span class="za-cite za-cite-E1">1</span><span class="za-cite za-cite-E12">12</span>。',
    );
  });

  it("leaves inline code and fenced code alone", () => {
    const markdown = "use `[E3]` here [E4]\n```\n[E5]\n```\nafter [E6]";
    expect(citationsToHtml(markdown)).toBe(
      'use `[E3]` here <span class="za-cite za-cite-E4">4</span>\n```\n[E5]\n```\nafter <span class="za-cite za-cite-E6">6</span>',
    );
  });

  it("does not touch text that only looks similar", () => {
    expect(citationsToHtml("[Example E3] [E3 and a long title] [[E3 note]]")).toBe(
      "[Example E3] [E3 and a long title] [[E3 note]]",
    );
  });
});
