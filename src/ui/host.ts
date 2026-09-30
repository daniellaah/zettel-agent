import type { App, Component } from "obsidian";
import { createContext, useContext } from "react";

/** What the React tree needs from Obsidian, provided by the ChatView. */
export interface ChatHost {
  app: App;
  /** Owner for MarkdownRenderer children, so they unload with the view. */
  component: Component;
  model(): string;
  providerLabel(): string;
  /** "Title › Heading" for an evidence id, or null if unknown. */
  describeEvidence(id: string): string | null;
  openEvidence(id: string, newLeaf: boolean): void;
  openLink(linkText: string, newLeaf: boolean): void;
  /** Inserts at the cursor of the most recent note editor; false if there is none. */
  insertAtCursor(text: string): boolean;
  notify(message: string): void;
}

export const HostContext = createContext<ChatHost | null>(null);

export function useHost(): ChatHost {
  const host = useContext(HostContext);
  if (!host) throw new Error("ChatHost is missing");
  return host;
}
