/**
 * Evidence the agent has been shown, numbered E1, E2, … per conversation. An answer may
 * cite only ids from this ledger, and each id is pinned to the note's content hash so the
 * UI can flag a citation whose note changed after it was read.
 */

export interface Evidence {
  id: string;
  path: string;
  sectionId: string;
  /** Heading path of the cited section, e.g. ["原子性", "论证"]. */
  headingPath: string[];
  contentHash: string;
}

export class EvidenceLedger {
  private readonly byId = new Map<string, Evidence>();
  private readonly byKey = new Map<string, Evidence>();

  constructor(entries: Evidence[] = []) {
    for (const entry of entries) this.add(entry);
  }

  /** Returns the existing id for the same section and content, or assigns the next one. */
  register(evidence: Omit<Evidence, "id">): { evidence: Evidence; isNew: boolean } {
    const key = `${evidence.path}\u0000${evidence.sectionId}\u0000${evidence.contentHash}`;
    const existing = this.byKey.get(key);
    if (existing) return { evidence: existing, isNew: false };
    const entry = { ...evidence, id: `E${this.byId.size + 1}` };
    this.add(entry);
    return { evidence: entry, isNew: true };
  }

  get(id: string): Evidence | undefined {
    return this.byId.get(id.toUpperCase());
  }

  get size(): number {
    return this.byId.size;
  }

  entries(): Evidence[] {
    return [...this.byId.values()];
  }

  private add(entry: Evidence): void {
    this.byId.set(entry.id, entry);
    this.byKey.set(`${entry.path}\u0000${entry.sectionId}\u0000${entry.contentHash}`, entry);
  }
}

const CITATION = /\[((?:E\d+)(?:\s*[,，、]\s*E\d+)*)\]/g;

/** Evidence ids cited as [E3] or [E3, E7] in answer text, in order of first appearance. */
export function citedIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(CITATION)) {
    for (const id of match[1]!.split(/\s*[,，、]\s*/)) ids.add(id.toUpperCase());
  }
  return [...ids];
}
