import { z } from "zod";

import { EvidenceLedger } from "../evidence";
import type { ToolDefinition } from "../provider";
import { contractSummary, quoteData, ToolFault, type ResultContract } from "../tool-contract";
import { linksTool } from "./links";
import { listTool } from "./list";
import { matchTool } from "./match";
import { readTool } from "./read";
import { searchTool } from "./search";
import { MAX_OUTPUT, type ToolContext, type ToolOutcome } from "./shared";

export type { ToolContext, ToolOutcome } from "./shared";
export { openingText } from "./shared";
export { boundedMatcher } from "./match";
export { excerptWindow } from "./search";

/** The five read-only tools, in the order the model sees them. */
export const TOOLS = [searchTool, matchTool, readTool, linksTool, listTool];

export function toolDefinitions(): ToolDefinition[] {
  return TOOLS.map((tool) => {
    const schema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: tool.name, description: tool.description, inputSchema: schema };
  });
}

/** Evidence registration is transactional: undelivered/over-budget IDs never enter the ledger. */
export function executeTool(name: string, input: unknown, context: ToolContext): ToolOutcome {
  const tool = TOOLS.find((t) => t.name === name);
  const parsed = tool?.schema.safeParse(input);
  const maxChars = Math.max(0, context.maxChars ?? MAX_OUTPUT);
  const fail = (
    code: NonNullable<ResultContract["error"]>["code"],
    message: string,
  ): ToolOutcome => {
    const contract: ResultContract = {
      version: 1,
      tool: name,
      scope: "accessible-research-corpus",
      effective: parsed?.success ? (parsed.data as Record<string, unknown>) : {},
      revision: context.corpus.revision,
      returned: { count: 0, unit: "notes" },
      candidates: { count: null, semantics: "unknown" },
      hasMore: false,
      truncated: false,
      exposures: [],
      error: { code, nextAction: message },
    };
    const text = `<note_lines>${quoteData(message)}</note_lines>\n${contractSummary(contract)}`;
    const content =
      text.length <= maxChars &&
      new TextEncoder().encode(JSON.stringify(text)).length <= (context.maxOutputBytes ?? Infinity)
        ? text
        : "Output budget.".slice(
            0,
            Math.min(maxChars, Math.max(0, (context.maxOutputBytes ?? Infinity) - 2)),
          );
    contract.outputChars = content.length;
    return {
      content,
      isError: true,
      summary: `${name} → ${code}`,
      evidenceIds: [],
      newEvidence: 0,
      contract,
    };
  };
  if (!tool || !parsed?.success)
    return fail(
      "invalid-input",
      tool
        ? `Invalid input: ${parsed && !parsed.success ? z.prettifyError(parsed.error) : ""}. Retry with tool schema.`
        : `Unknown tool ${name}. Use one of the five read-only tools.`,
    );
  const ledger = new EvidenceLedger(context.ledger.entries());
  try {
    const result = tool.run(parsed.data, { ...context, ledger });
    if (result.content.length > maxChars)
      return fail(
        "output-budget",
        "Result exceeds remaining output budget. Reduce limit/max_chars, use a specific section, or begin a new turn.",
      );
    if (
      new TextEncoder().encode(JSON.stringify(result.content)).length >
      (context.maxOutputBytes ?? Infinity)
    )
      return fail(
        "output-budget",
        "Result exceeds remaining input allowance. Reduce limit/max_chars or read a specific section.",
      );
    for (const entry of ledger.entries().slice(context.ledger.size)) {
      context.ledger.register({
        path: entry.path,
        sectionId: entry.sectionId,
        headingPath: entry.headingPath,
        contentHash: entry.contentHash,
        linkPath: entry.linkPath,
      });
    }
    return result;
  } catch (error) {
    return fail(
      error instanceof ToolFault ? error.code : "tool-failed",
      error instanceof Error ? error.message : "Tool failed. Retry with a narrower query.",
    );
  }
}
