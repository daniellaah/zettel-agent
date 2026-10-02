import { MarkdownView, Plugin, debounce } from "obsidian";

import type { ModelProvider } from "./agent/provider";
import { PROVIDERS } from "./agent/providers/catalog";
import { createProvider } from "./agent/providers";
import { recordingFetch, replayFetch, type Cassette } from "./agent/recording";
import { ChatSession } from "./session/chat-session";
import { resolveSettings, type PluginSettings } from "./settings";
import { ChatView, VIEW_TYPE_CHAT } from "./ui/ChatView";
import { registerNoteCommands } from "./ui/CreateNoteModal";
import { SettingsTab } from "./ui/SettingsTab";
import { FileConversationStore } from "./vault/conversations";
import { RecordingStore } from "./vault/recordings";
import { VaultCorpus } from "./vault/vault-corpus";

export default class ZettelAgentPlugin extends Plugin {
  declare settings: PluginSettings;
  vaultCorpus!: VaultCorpus;
  session!: ChatSession;
  recordings!: RecordingStore;
  conversations!: FileConversationStore;

  /** Rebuild the index after the Zettelkasten folder setting stops changing. */
  readonly scheduleRebuild = debounce(() => void this.vaultCorpus.rebuild(), 800, true);

  override async onload(): Promise<void> {
    this.settings = resolveSettings(await this.loadData());
    this.vaultCorpus = new VaultCorpus(this.app, () => this.settings);
    const pluginDir =
      this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    this.recordings = new RecordingStore(this.app, `${pluginDir}/recordings`);
    this.conversations = new FileConversationStore(this.app, `${pluginDir}/conversations`);
    this.session = new ChatSession({
      corpus: async () => {
        await this.vaultCorpus.whenReady();
        return this.vaultCorpus.current;
      },
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
      return createProvider(provider, "replay", model, replayFetch(cassette.exchanges));
    }

    const secretId = apiKeySecretIds[provider];
    const apiKey = secretId ? this.app.secretStorage.getSecret(secretId) : null;
    if (!apiKey) return `Add your ${PROVIDERS[provider].label} API key in Settings → Zettel Agent.`;
    if (recordingMode === "off") return createProvider(provider, apiKey, model);

    const cassette: Cassette = {
      version: 1,
      provider,
      model,
      // Shown as-is in Replay; only the file name uses the normalized form.
      question: question.trim(),
      recordedAt: new Date().toISOString(),
      exchanges: [],
    };
    const fetch = recordingFetch(globalThis.fetch.bind(globalThis), (exchange) => {
      cassette.exchanges.push(exchange);
      void this.recordings.save(cassette);
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
