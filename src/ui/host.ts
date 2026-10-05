import type { App, Component } from "obsidian";
import { createContext, useContext } from "react";

import type { ConversationSummary } from "../session/conversation-storage";
import type { NoteOption } from "./mentions";
import type { NoteKind } from "./note-template";
import type { ChatConfiguration } from "./presentation";

/** What the React tree needs from Obsidian, provided by the ChatView. */
export interface ChatHost {
  app: App;
  /** Owner for MarkdownRenderer children, so they unload with the view. */
  component: Component;
  configuration(): ChatConfiguration;
  onConfigurationChange(callback: () => void): () => void;
  openSettings(): void;
  /** "Title › Heading" for an evidence id, or null if unknown. */
  describeEvidence(id: string): string | null;
  openEvidence(id: string, newLeaf: boolean): void;
  /** Whether the note behind an evidence id still has the content that was cited. */
  evidenceState(id: string): "current" | "changed" | "missing";
  /** Vault path a link resolves to, or null when the note does not exist. */
  resolveLink(linkText: string): string | null;
  /** Opens an existing note; never creates one. */
  openLink(linkText: string, newLeaf: boolean): void;
  /** Inserts at the cursor of the most recent note editor; false if there is none. */
  insertAtCursor(text: string): boolean;
  notify(message: string): void;
  /**
   * Opens the fixed-template creation dialog; the note is created only when the user
   * submits it. Call from a button's click handler only, never from model output.
   */
  openNoteDialog(kind: NoteKind): void;

  /** The Zettelkasten note open in the most recent editor, if any. */
  activeNote(): { path: string; title: string } | null;
  /** Text selected in the most recent editor, if any. */
  selection(): { path: string; title: string; text: string } | null;
  /** Calls back when the open note changes; returns an unsubscribe function. */
  onActiveNoteChange(callback: () => void): () => void;
  /** Calls back when text is selected in a note; returns an unsubscribe function. */
  onSelectionChange(callback: () => void): () => void;
  /** Notes the agent can see, for @-mentions. */
  noteOptions(): NoteOption[];

  listConversations(): Promise<ConversationSummary[]>;
  openConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
}

export const HostContext = createContext<ChatHost | null>(null);

export function useHost(): ChatHost {
  const host = useContext(HostContext);
  if (!host) throw new Error("ChatHost is missing");
  return host;
}
