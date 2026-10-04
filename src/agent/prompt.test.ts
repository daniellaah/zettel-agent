import { describe, expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { resolveSettings, stageForPath } from "../settings";
import { SYSTEM_PROMPT, turnContext } from "./prompt";

describe("research scope in the prompt", () => {
  it("does not count or expose an open fleeting capture", () => {
    const settings = resolveSettings({ zettelkastenRoot: "Z" });
    const corpus = new Corpus({ stageForPath: (path) => stageForPath(path, settings) });
    corpus.upsert("Z/Fleeting/Capture.md", "Private unfinished capture");
    corpus.upsert("Z/Permanent/Claim.md", "An independently useful claim");
    const context = turnContext(corpus, "Z/Fleeting/Capture.md");
    expect(context).toContain("Vault: 1 notes");
    expect(context).toContain("permanent 1");
    expect(context).not.toContain("fleeting");
    expect(context).not.toContain("Capture");
    expect(context).toContain("No Zettelkasten note is open.");
    expect(turnContext(corpus, "Z/Permanent/Claim.md")).toContain('"Claim"');
    expect(SYSTEM_PROMPT).toContain("Fleeting captures are excluded from every research tool.");
  });
});
