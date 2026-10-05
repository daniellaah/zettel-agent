import { citedHeading, type Evidence } from "../agent/evidence";

/** An exact saved identity, never a basename search or a creation-capable link. */
export function evidenceTarget(
  evidence: Evidence | undefined,
  currentHash: string | undefined,
): { path: string; subpath: string; notice: string | null } | string {
  if (!evidence) return "This citation does not match anything the agent read.";
  if (!currentHash) return "This note was moved or deleted, or is outside the Zettelkasten folder.";
  const changed = currentHash !== evidence.contentHash;
  const heading = changed ? null : citedHeading(evidence);
  return {
    path: evidence.path,
    subpath: heading ? `#${heading}` : "",
    notice: changed
      ? "This note has changed since it was cited. Opening its current content."
      : null,
  };
}
