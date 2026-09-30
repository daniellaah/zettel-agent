import { ItemView, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { linkTarget } from "../agent/evidence";
import { PROVIDERS } from "../agent/providers/catalog";
import type ZettelAgentPlugin from "../main";
import { ChatApp } from "./ChatApp";
import { HostContext, type ChatHost } from "./host";

export const VIEW_TYPE_CHAT = "zettel-agent-chat";

export class ChatView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ZettelAgentPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  override getDisplayText(): string {
    return "Zettelkasten chat";
  }

  override getIcon(): string {
    return "messages-square";
  }

  /** The last text selected in a note's reading view (clicking the chat clears the DOM's). */
  private lastSelection: { path: string; title: string; text: string } | null = null;
  private readonly selectionListeners = new Set<() => void>();

  override onOpen(): Promise<void> {
    this.contentEl.addClass("za-view");
    this.registerDomEvent(document, "selectionchange", () => this.rememberSelection());
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext.Provider value={this.createHost()}>
          <ChatApp session={this.plugin.session} />
        </HostContext.Provider>
      </StrictMode>,
    );
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }

  private rememberSelection(): void {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (!selection || text.trim() === "" || !selection.anchorNode) return;
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    if (
      view instanceof MarkdownView &&
      view.file &&
      view.contentEl.contains(selection.anchorNode)
    ) {
      this.lastSelection = { path: view.file.path, title: view.file.basename, text };
      for (const listener of this.selectionListeners) listener();
    }
  }

  private createHost(): ChatHost {
    const { app, plugin } = this;
    const session = plugin.session;
    const recentEditor = () => {
      const view = app.workspace.getMostRecentLeaf()?.view;
      return view instanceof MarkdownView ? view : null;
    };
    const resolveLink = (linkText: string) =>
      app.metadataCache.getFirstLinkpathDest(linkText.split(/[#|]/)[0]!.trim(), "")?.path ?? null;
    return {
      app,
      component: this,
      model: () => plugin.settings.models[plugin.settings.provider],
      providerLabel: () => PROVIDERS[plugin.settings.provider].label,
      recordingMode: () => plugin.settings.recordingMode,
      recordedQuestions: () =>
        plugin.recordings.questions(
          plugin.settings.provider,
          plugin.settings.models[plugin.settings.provider],
        ),
      describeEvidence: (id) => {
        const evidence = session.evidence(id);
        return evidence ? linkTarget(evidence).replace("#", " › ") : null;
      },
      openEvidence: (id, newLeaf) => {
        const evidence = session.evidence(id);
        if (!evidence) return;
        const heading = evidence.headingPath.length > 1 ? `#${evidence.headingPath.at(-1)}` : "";
        void app.workspace.openLinkText(
          `${evidence.path.replace(/\.md$/, "")}${heading}`,
          "",
          newLeaf,
        );
      },
      resolveLink,
      openLink: (linkText, newLeaf) => {
        // Obsidian's openLinkText creates a note for an unresolved link; the agent must not.
        if (!resolveLink(linkText)) {
          new Notice(`"${linkText.split("#")[0]}" does not exist in your vault.`);
          return;
        }
        void app.workspace.openLinkText(linkText, "", newLeaf);
      },
      insertAtCursor: (text) => {
        const view = app.workspace.getMostRecentLeaf()?.view;
        if (!(view instanceof MarkdownView)) return false;
        view.editor.replaceSelection(text);
        view.editor.focus();
        return true;
      },
      notify: (message) => new Notice(message),

      activeNote: () => {
        const file = recentEditor()?.file;
        const corpus = plugin.vaultCorpus.current;
        return file && corpus.get(file.path) ? { path: file.path, title: file.basename } : null;
      },
      selection: () => {
        const view = recentEditor();
        if (!view?.file) return null;
        const editorText = view.getMode() === "source" ? view.editor.getSelection() : "";
        if (editorText.trim() !== "") {
          return { path: view.file.path, title: view.file.basename, text: editorText };
        }
        // Reading view: the selection made there, remembered before focus moved to the chat.
        return this.lastSelection?.path === view.file.path ? this.lastSelection : null;
      },
      onSelectionChange: (callback) => {
        this.selectionListeners.add(callback);
        return () => this.selectionListeners.delete(callback);
      },
      onActiveNoteChange: (callback) => {
        const ref = app.workspace.on("file-open", callback);
        return () => app.workspace.offref(ref);
      },
      noteOptions: () => {
        const corpus = plugin.vaultCorpus.current;
        return corpus.paths().map((path) => ({
          path,
          title: corpus.get(path)!.title,
          stage: corpus.stage(path),
        }));
      },

      listConversations: () => plugin.conversations.list(),
      openConversation: async (id) => {
        const record = await plugin.conversations.load(id);
        if (record) session.load(record);
        else new Notice("That chat could not be found.");
      },
      deleteConversation: async (id) => {
        await plugin.conversations.delete(id);
        if (session.getSnapshot().conversationId === id) session.reset();
      },
    };
  }
}
