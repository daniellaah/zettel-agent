/**
 * Link graph over resolved note paths. Resolution is injected: inside Obsidian it is
 * `metadataCache.getFirstLinkpathDest`, so the graph matches what the user sees; in Node
 * (tests, evaluation) `basenameResolver` approximates it.
 */

/** Resolves a link target as written in `sourcePath` to a note path, or null if unresolved. */
export type LinkResolver = (target: string, sourcePath: string) => string | null;

export class LinkGraph {
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();
  private readonly unresolved = new Map<string, Set<string>>();

  static build(rawLinks: Map<string, string[]>, resolve: LinkResolver): LinkGraph {
    const graph = new LinkGraph();
    for (const [source, targets] of rawLinks) {
      for (const target of targets) {
        const resolved = resolve(target, source);
        if (resolved === null) addTo(graph.unresolved, source, target);
        else {
          addTo(graph.outgoing, source, resolved);
          addTo(graph.incoming, resolved, source);
        }
      }
    }
    return graph;
  }

  outlinks(path: string): string[] {
    return sorted(this.outgoing.get(path));
  }

  backlinks(path: string): string[] {
    return sorted(this.incoming.get(path));
  }

  unresolvedLinks(path: string): string[] {
    return sorted(this.unresolved.get(path));
  }

  /** Notes reachable within `depth` hops in either direction, with their distance. */
  neighborhood(
    path: string,
    depth: number,
    direction: "both" | "outgoing" | "incoming" = "both",
  ): Map<string, number> {
    const distances = new Map<string, number>([[path, 0]]);
    let frontier = [path];
    for (let hop = 1; hop <= depth && frontier.length > 0; hop++) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const neighbor of [
          ...(direction !== "incoming" ? this.outlinks(node) : []),
          ...(direction !== "outgoing" ? this.backlinks(node) : []),
        ]) {
          if (distances.has(neighbor)) continue;
          distances.set(neighbor, hop);
          next.push(neighbor);
        }
      }
      frontier = next;
    }
    distances.delete(path);
    return distances;
  }

  isOrphan(path: string): boolean {
    return !this.outgoing.get(path)?.size && !this.incoming.get(path)?.size;
  }
}

/**
 * Obsidian-like resolution without Obsidian: an exact vault path wins; otherwise the
 * basename must match (case-insensitive), preferring the source's folder, then the
 * shortest path.
 */
export function basenameResolver(paths: Iterable<string>): LinkResolver {
  const byPath = new Map<string, string>();
  const byBasename = new Map<string, string[]>();
  for (const path of paths) {
    const withoutExtension = path.replace(/\.md$/i, "");
    byPath.set(withoutExtension.toLowerCase(), path);
    const base = (withoutExtension.split("/").pop() ?? withoutExtension).toLowerCase();
    byBasename.set(base, [...(byBasename.get(base) ?? []), path]);
  }
  return (target, sourcePath) => {
    const key = target.replace(/\.md$/i, "").toLowerCase();
    const exact = byPath.get(key);
    if (exact) return exact;
    const candidates = byBasename.get(key.split("/").pop() ?? key);
    if (!candidates || candidates.length === 0) return null;
    const folder = sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1);
    return [...candidates].sort(
      (a, b) =>
        Number(!a.startsWith(folder)) - Number(!b.startsWith(folder)) ||
        a.length - b.length ||
        a.localeCompare(b),
    )[0]!;
  };
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

function sorted(set: Set<string> | undefined): string[] {
  return set ? [...set].sort() : [];
}
