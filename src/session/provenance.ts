import type { EvidenceLedger } from "../agent/evidence";
import type { ChatMessage } from "../agent/messages";
import type { DeliveredSpan, EvidenceScope } from "../agent/tool-contract";

/**
 * Where an answer came from, for the chat pane: the sources it cites, how much of
 * each the model was actually shown, and the notes it looked at without citing. Built only from
 * recorded deliveries, so it never claims more than the model saw.
 */

/** How much of a section a delivery showed, most first. */
export const SCOPE_ORDER: readonly EvidenceScope[] = [
  "body",
  "excerpt",
  "matched-line",
  "preview",
  "outline",
  "metadata",
  "title",
  "graph",
];

export interface SourceView {
  id: string;
  path: string;
  title: string;
  /** The cited section's heading; null for a whole note. */
  heading: string | null;
  /** The most of it the model was shown; null when only a discarded attempt delivered it. */
  seen: EvidenceScope | null;
  /** For `body`: the whole section was delivered, not one page of it. */
  whole: boolean;
  /** The user attached it, rather than the agent finding it. */
  attached: boolean;
}

export interface AnswerProvenance {
  /** In order of first citation; ids the conversation never delivered are left out. */
  cited: SourceView[];
  /** One entry per note delivered during this turn whose sections were never cited. */
  consulted: SourceView[];
  /** Distinct notes among the cited sources. */
  notes: number;
}

interface Seen {
  scope: EvidenceScope;
  whole: boolean;
  attached: boolean;
}

function deliveries(
  messages: readonly ChatMessage[],
): { span: DeliveredSpan; attached: boolean }[] {
  return messages.flatMap((message) =>
    message.role === "user"
      ? [
          ...(message.deliveries ?? []).flatMap((contract) =>
            contract.exposures.map((span) => ({ span, attached: true })),
          ),
          ...message.parts.flatMap((part) =>
            part.type === "tool_result" && part.contract
              ? part.contract.exposures.map((span) => ({ span, attached: false }))
              : [],
          ),
        ]
      : [],
  );
}

function strongest(entries: { span: DeliveredSpan; attached: boolean }[]): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  for (const { span, attached } of entries) {
    const previous = seen.get(span.id);
    const scope =
      previous && SCOPE_ORDER.indexOf(previous.scope) <= SCOPE_ORDER.indexOf(span.scope)
        ? previous.scope
        : span.scope;
    const body = span.scope === "body";
    seen.set(span.id, {
      scope,
      whole: (previous?.whole ?? false) || (body && span.wholeSection),
      attached: (previous?.attached ?? false) || (body && attached),
    });
  }
  return seen;
}

/** `turnStart`/`turnEnd` bound this answer's messages in `history`; earlier deliveries still count as seen. */
export function answerProvenance(options: {
  history: readonly ChatMessage[];
  turnStart: number;
  turnEnd: number;
  cited: readonly string[];
  ledger: EvidenceLedger;
}): AnswerProvenance {
  const { ledger } = options;
  const seen = strongest(deliveries(options.history.slice(0, options.turnEnd)));
  const view = (id: string, overall: Seen | undefined): SourceView | null => {
    const evidence = ledger.get(id);
    if (!evidence) return null;
    const title = (evidence.path.split("/").pop() ?? evidence.path).replace(/\.md$/i, "");
    return {
      id: evidence.id,
      path: evidence.path,
      title,
      heading: evidence.headingPath.length > 1 ? evidence.headingPath.at(-1)! : null,
      seen: overall?.scope ?? null,
      whole: overall?.whole ?? false,
      attached: overall?.attached ?? false,
    };
  };
  const cited = [...new Set(options.cited.map((id) => id.toUpperCase()))]
    .map((id) => view(id, seen.get(id)))
    .filter((source) => source !== null);
  const citedPaths = new Set(cited.map((source) => source.path));

  // Notes delivered in this turn but never cited: one row per note, with its most-seen section.
  const turn = deliveries(options.history.slice(options.turnStart, options.turnEnd));
  const thisTurn = strongest(turn);
  const consulted = new Map<string, SourceView>();
  for (const { span } of turn) {
    if (citedPaths.has(span.path)) continue;
    const candidate = view(span.id, thisTurn.get(span.id));
    if (!candidate) continue;
    const current = consulted.get(span.path);
    const stronger =
      !current ||
      SCOPE_ORDER.indexOf(candidate.seen ?? "graph") < SCOPE_ORDER.indexOf(current.seen ?? "graph");
    if (stronger) consulted.set(span.path, { ...candidate, heading: null });
  }
  return { cited, consulted: [...consulted.values()], notes: citedPaths.size };
}
