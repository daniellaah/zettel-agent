import type { Corpus } from "../retrieval/corpus";
import { citedIds } from "./evidence";
import { deliveredContracts, type ChatMessage } from "./messages";

export interface CitationIssue {
  code: "undelivered-citation" | "stale-evidence";
  id: string;
}

/**
 * Structural checks on a finished answer, at no model cost: a cited id whose text was never
 * delivered in the request the model answered from, or whose note has changed since every
 * delivery of it. Neither check says whether the source supports the claim.
 */
export function citationIssues(
  answer: string,
  messages: readonly ChatMessage[],
  corpus: Corpus,
): CitationIssue[] {
  const spans = deliveredContracts(messages).flatMap((contract) => contract.exposures);
  return citedIds(answer).flatMap((id): CitationIssue[] => {
    const delivered = spans.filter((span) => span.id === id);
    if (delivered.length === 0) return [{ code: "undelivered-citation", id }];
    const stale = delivered.every(
      (span) => corpus.get(span.path)?.contentHash !== span.contentHash,
    );
    return stale ? [{ code: "stale-evidence", id }] : [];
  });
}
