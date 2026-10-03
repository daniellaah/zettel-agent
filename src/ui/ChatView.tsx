import { ItemView, MarkdownView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { linkTarget } from "../agent/evidence";
import { PROVIDERS } from "../agent/providers/catalog";
import type ZettelAgentPlugin from "../main";
import { evidenceTarget } from "./evidence-target";
import { BRAND_ICON } from "./brand-icon";
import { ChatApp } from "./ChatApp";
import { CreateNoteModal } from "./CreateNoteModal";
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
    return BRAND_ICON;
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
    this.plugin.session.stop();
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
      configuration: () => {
        const { provider, models, apiKeySecretIds, recordingMode, zettelkastenRoot } =
          plugin.settings;
        const secretId = apiKeySecretIds[provider];
        return {
          model: models[provider],
          provider: PROVIDERS[provider].label,
          mode: recordingMode,
          hasKey:
            recordingMode !== "replay" && !!secretId && !!app.secretStorage.getSecret(secretId),
          folder: zettelkastenRoot || "Whole vault",
          notes: plugin.vaultCorpus.current.paths().length,
          indexed: plugin.researchIndexed,
        };
      },
      onConfigurationChange: (callback) => {
        plugin.configurationListeners.add(callback);
        // Keys may also be changed in Obsidian's separate secret manager.
        window.addEventListener("focus", callback);
        const layout = app.workspace.on("layout-change", callback);
        return () => {
          plugin.configurationListeners.delete(callback);
          window.removeEventListener("focus", callback);
          app.workspace.offref(layout);
        };
      },
      openSettings: () => {
        const setting = (
          app as typeof app & { setting: { open(): void; openTabById(id: string): void } }
        ).setting;
        setting.open();
        setting.openTabById(plugin.manifest.id);
      },
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
        const target = evidenceTarget(
          evidence,
          evidence ? plugin.vaultCorpus.current.get(evidence.path)?.contentHash : undefined,
        );
        if (typeof target === "string") {
          new Notice(target);
          return;
        }
        const file = app.vault.getAbstractFileByPath(target.path);
        if (!(file instanceof TFile)) {
          new Notice("This evidence file is no longer available.");
          return;
        }
        if (target.notice) new Notice(target.notice);
        void app.workspace
          .getLeaf(newLeaf)
          .openFile(file, { eState: { subpath: target.subpath } })
          .catch(() => new Notice("This evidence could not be opened. No note was created."));
      },
      resolveLink,
      openLink: (linkText, newLeaf) => {
        const path = resolveLink(linkText);
        const file = path ? app.vault.getAbstractFileByPath(path) : null;
        if (!(file instanceof TFile)) {
          new Notice("This linked note does not exist. No note was created.");
          return;
        }
        const subpath = linkText.includes("#")
          ? `#${linkText.split("#").slice(1).join("#").split("|")[0]}`
          : "";
        void app.workspace
          .getLeaf(newLeaf)
          .openFile(file, { eState: { subpath } })
          .catch(() => new Notice("This linked note could not be opened. No note was created."));
      },
      insertAtCursor: (text) => {
        const view = app.workspace.getMostRecentLeaf()?.view;
        if (!(view instanceof MarkdownView)) return false;
        view.editor.replaceSelection(text);
        view.editor.focus();
        return true;
      },
      notify: (message) => new Notice(message),
      openNoteDialog: (kind) => new CreateNoteModal(app, plugin.settings, kind).open(),

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
        try {
          const record = await plugin.conversations.load(id);
          if (record) session.load(record);
          else new Notice("That chat could not be found.");
        } catch {
          new Notice("This saved chat could not be loaded. Its files were retained for recovery.");
        }
      },
      deleteConversation: async (id) => {
        await plugin.conversations.delete(id);
        if (session.getSnapshot().conversationId === id) session.reset();
      },
    };
  }
}
