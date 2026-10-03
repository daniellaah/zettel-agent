import { MarkdownView, Plugin, debounce, apiVersion } from "obsidian";

import type { ModelProvider } from "../agent/provider";
import { PROVIDERS } from "../agent/providers/catalog";
import { createProvider } from "../agent/providers";
import {
  recordingFetch,
  replayFetch,
  validateReplayBinding,
  type Cassette,
} from "../agent/recording";
import { ChatSession } from "../session/chat-session";
import { resolveSettings, type PluginSettings } from "../settings";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { registerNoteCommands } from "./CreateNoteModal";
import { SettingsTab } from "./SettingsTab";
import { FileConversationStore } from "../vault/conversations";
import { RecordingStore } from "../vault/recordings";
import { LocalEmbeddings } from "../vault/local-embeddings";
import { VaultCorpus } from "../vault/vault-corpus";

export default class ZettelAgentPlugin extends Plugin {
  readonly hostApiVersion = apiVersion;
  declare settings: PluginSettings;
  vaultCorpus!: VaultCorpus;
  localEmbeddings!: LocalEmbeddings;
  session!: ChatSession;
  recordings!: RecordingStore;
  conversations!: FileConversationStore;

  /** Rebuild the index after the Zettelkasten folder setting stops changing. */
  readonly scheduleRebuild = debounce(() => void this.vaultCorpus.rebuild(), 800, true);

  override async onload(): Promise<void> {
    this.settings = resolveSettings(await this.loadData());
    this.vaultCorpus = new VaultCorpus(
      this.app,
      () => this.settings,
      () => this.localEmbeddings.schedule(),
    );
    this.localEmbeddings = new LocalEmbeddings(
      this.app,
      () => this.settings,
      () => this.vaultCorpus.current,
      () => this.vaultCorpus.whenReady(),
    );
    const pluginDir =
      this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    this.recordings = new RecordingStore(this.app, `${pluginDir}/recordings`);
    this.conversations = new FileConversationStore(this.app, `${pluginDir}/conversations`);
    this.session = new ChatSession({
      corpus: async () => {
        await this.vaultCorpus.whenReady();
        return this.vaultCorpus.current;
      },
      search: this.localEmbeddings.search,
      reviewMode: () => this.settings.answerReviewMode,
      provider: (question) => this.createProvider(question),
      activeNotePath: () => this.activeNotePath(),
      store: this.conversations,
    });

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("messages-square", "Open Zettelkasten chat", () => {
      void this.activateChatView();
    });
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => void this.activateChatView(),
    });
    registerNoteCommands(this, () => this.settings);
    this.addSettingTab(new SettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.vaultCorpus.registerEvents(this);
      void this.vaultCorpus.rebuild();
    });
  }

  override onunload(): void {
    this.session.stop();
    this.localEmbeddings.dispose();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async createProvider(question: string): Promise<ModelProvider | string> {
    const { provider, models, apiKeySecretIds, recordingMode } = this.settings;
    const model = models[provider];
    if (!model) return "Enter a model ID in Settings → Zettel Agent.";

    if (recordingMode === "replay") {
      const cassette = await this.recordings.load(provider, model, question);
      if (!cassette) {
        return `No recording of this question for ${model}. Replay mode only answers recorded questions; switch to Record or Off in Settings → Zettel Agent to ask new ones.`;
      }
      // Replay never touches the network, so no API key is needed.
      await this.vaultCorpus.whenReady();
      try {
        validateReplayBinding(
          cassette,
          this.vaultCorpus.current.revision,
          this.settings.answerReviewMode,
        );
      } catch (error) {
        return error instanceof Error ? error.message : "Replay binding could not be verified.";
      }
      const adapter = createProvider(
        provider,
        "replay",
        model,
        replayFetch(cassette.exchanges, { strict: true }),
      );
      return {
        provider: adapter.provider,
        model: adapter.model,
        send: adapter.send.bind(adapter),
        describeError: () =>
          "Replay refused: the request, history or delivered evidence differs, or the recording is incomplete. No network was used.",
      };
    }

    const secretId = apiKeySecretIds[provider];
    const apiKey = secretId ? this.app.secretStorage.getSecret(secretId) : null;
    if (!apiKey) return `Add your ${PROVIDERS[provider].label} API key in Settings → Zettel Agent.`;
    if (recordingMode === "off") return createProvider(provider, apiKey, model);

    await this.vaultCorpus.whenReady();
    const cassette: Cassette = {
      version: 2,
      binding: {
        corpusRevision: this.vaultCorpus.current.revision,
        retrieval: this.settings.retrievalMode === "lexical" ? "bm25" : "hybrid-local",
        reviewMode: this.settings.answerReviewMode,
      },
      provider,
      model,
      // Shown as-is in Replay; only the file name uses the normalized form.
      question: question.trim(),
      recordedAt: new Date().toISOString(),
      exchanges: [],
    };
    const recordingItemId = this.session.getSnapshot().items.at(-1)?.id;
    const recordingConversationId = this.session.getSnapshot().conversationId;
    const fetch = recordingFetch(globalThis.fetch.bind(globalThis), (exchange) => {
      cassette.exchanges.push(exchange);
      void this.recordings
        .save(cassette)
        .catch(() =>
          this.session.reportStorageError(
            "This recording could not be saved. Check plugin storage access.",
            recordingItemId,
            recordingConversationId,
          ),
        );
    });
    return createProvider(provider, apiKey, model, fetch);
  }

  private activeNotePath(): string | null {
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    return view instanceof MarkdownView ? (view.file?.path ?? null) : null;
  }

  private async activateChatView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    const leaf = existing ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    await workspace.revealLeaf(leaf);
  }
}
