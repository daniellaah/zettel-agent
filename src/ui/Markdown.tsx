import { Component, Keymap, MarkdownRenderer } from "obsidian";
import { memo, useEffect, useRef, useState, type MouseEvent } from "react";

import { useHost, type ChatHost } from "./host";

/** While streaming, re-render Markdown at most this often. */
const STREAM_RENDER_MS = 120;
const CITATION = /\[((?:E\d+)(?:\s*[,，、]\s*E\d+)*)\]/g;

/**
 * Renders assistant Markdown with Obsidian's renderer, so [[links]], callouts and code
 * look like the rest of the vault. [E3] citations become clickable chips.
 */
export const Markdown = memo(function Markdown(props: { text: string; streaming: boolean }) {
  const host = useHost();
  const ref = useRef<HTMLDivElement>(null);
  const text = useThrottled(props.text, props.streaming ? STREAM_RENDER_MS : 0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const child = new Component();
    host.component.addChild(child);
    const staging = document.createElement("div");
    let cancelled = false;
    void MarkdownRenderer.render(host.app, text, staging, "", child).then(() => {
      if (cancelled) return;
      decorateCitations(staging, host);
      markUnresolvedLinks(staging, host);
      container.replaceChildren(...Array.from(staging.childNodes));
    });
    return () => {
      cancelled = true;
      host.component.removeChild(child);
    };
  }, [host, text]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const newLeaf = Keymap.isModEvent(event.nativeEvent) !== false;
    const cite = target.closest<HTMLElement>(".za-cite");
    if (cite?.dataset.id) {
      event.preventDefault();
      host.openEvidence(cite.dataset.id, newLeaf);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a.internal-link");
    if (link) {
      event.preventDefault();
      host.openLink(link.dataset.href ?? link.getAttribute("href") ?? "", newLeaf);
    }
  };

  return <div ref={ref} className="za-markdown markdown-rendered" onClick={onClick} />;
});

/** Links to notes that do not exist get Obsidian's faded "unresolved" style. */
function markUnresolvedLinks(root: HTMLElement, host: ChatHost): void {
  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
    const target = link.dataset.href ?? link.getAttribute("href") ?? "";
    if (!host.resolveLink(target)) {
      link.classList.add("is-unresolved");
      link.title = "This note does not exist in your vault";
    }
  }
}

function decorateCitations(root: HTMLElement, host: ChatHost): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("code, pre")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    CITATION.lastIndex = 0;
    if (CITATION.test(node.data)) nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of node.data.matchAll(CITATION)) {
      fragment.append(node.data.slice(last, match.index));
      for (const id of match[1]!.split(/\s*[,，、]\s*/)) {
        const chip = document.createElement("button");
        chip.className = "za-cite";
        chip.dataset.id = id.toUpperCase();
        chip.textContent = id.slice(1);
        const description = host.describeEvidence(id);
        chip.title = description ?? `${id}: not among the evidence retrieved`;
        if (!description) chip.classList.add("za-cite-unknown");
        fragment.append(chip);
      }
      last = match.index + match[0].length;
    }
    fragment.append(node.data.slice(last));
    node.replaceWith(fragment);
  }
}

/** Returns `value`, updated at most every `ms` milliseconds (immediately when ms is 0). */
function useThrottled<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);
  useEffect(() => {
    if (ms === 0) return; // not throttling: the latest value is returned directly below
    const wait = Math.max(0, lastUpdate.current + ms - Date.now());
    const timer = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return ms === 0 ? value : throttled;
}
