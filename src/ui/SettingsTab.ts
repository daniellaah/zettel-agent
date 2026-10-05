import { PluginSettingTab, SecretComponent, Setting, type App } from "obsidian";

import type ZettelAgentPlugin from "../main";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../agent/providers/catalog";
import { DEFAULT_EMBEDDING_MODEL } from "../retrieval/embedding-models";
import { DEFAULT_OLLAMA_URL } from "../retrieval/ollama";
import { READY_COVERAGE, type SemanticStatus } from "../retrieval/semantic-indexer";
import { STAGES, isLocalUrl, normalizeFolder, type Stage } from "../settings";

const CUSTOM_MODEL = "__custom__";

const STAGE_HINTS: Record<Stage, string> = {
  fleeting: "Quick captures. Never searched by the agent.",
  literature: "One source each, in your own words.",
  permanent: "One idea each, linked to others.",
  writing: "Outlines and drafts.",
};

export class SettingsTab extends PluginSettingTab {
  /** Keeps the index status line current while the tab is open. */
  private statusListener: (() => void) | null = null;

  constructor(
    app: App,
    private readonly plugin: ZettelAgentPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    const save = () => void this.plugin.saveSettings();
    const rebuild = () => {
      save();
      this.plugin.scheduleRebuild();
    };
    containerEl.empty();
    this.hide();

    new Setting(containerEl).setName("Model").setHeading();

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Your questions and the note excerpts the agent reads are sent to this provider.")
      .addDropdown((dropdown) => {
        for (const id of PROVIDER_IDS) dropdown.addOption(id, PROVIDERS[id].label);
        dropdown.setValue(settings.provider).onChange((provider) => {
          settings.provider = provider as ProviderId;
          save();
          this.display();
        });
      });

    const provider = settings.provider;
    const info = PROVIDERS[provider];

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText("Stored in Obsidian's secret storage, not in the plugin's files. ");
          fragment.createEl("a", { text: `Get a ${info.label} key`, href: info.keyUrl });
        }),
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(settings.apiKeySecretIds[provider])
          .onChange((id) => {
            settings.apiKeySecretIds[provider] = id;
            save();
          }),
      );

    const isKnown = info.models.some((model) => model.id === settings.models[provider]);
    new Setting(containerEl).setName("Model").addDropdown((dropdown) => {
      for (const model of info.models) dropdown.addOption(model.id, model.label);
      dropdown.addOption(CUSTOM_MODEL, "Other model ID…");
      dropdown.setValue(isKnown ? settings.models[provider] : CUSTOM_MODEL).onChange((model) => {
        settings.models[provider] = model === CUSTOM_MODEL ? "" : model;
        save();
        this.display();
      });
    });

    if (!isKnown) {
      new Setting(containerEl)
        .setName("Model ID")
        .setDesc("The exact model name the provider's API expects.")
        .addText((text) =>
          text.setValue(settings.models[provider]).onChange((value) => {
            settings.models[provider] = value.trim();
            save();
          }),
        );
    }

    new Setting(containerEl).setName("Notes").setHeading();

    new Setting(containerEl)
      .setName("Zettelkasten folder")
      .setDesc("The folder the agent researches. Leave empty to use the whole vault.")
      .addText((text) =>
        text
          .setPlaceholder("02-Zettelkasten")
          .setValue(settings.zettelkastenRoot)
          .onChange((value) => {
            settings.zettelkastenRoot = normalizeFolder(value);
            rebuild();
          }),
      );

    new Setting(containerEl)
      .setName("Stage folders")
      .setDesc(
        "Sub-folders of the Zettelkasten folder, one per note stage. A note's type property, if it names a stage, takes precedence over its folder.",
      )
      .setHeading();

    for (const stage of STAGES) {
      new Setting(containerEl)
        .setName(`${stage[0]!.toUpperCase()}${stage.slice(1)}`)
        .setDesc(STAGE_HINTS[stage])
        .addText((text) =>
          text.setValue(settings.stageFolders[stage]).onChange((value) => {
            settings.stageFolders[stage] = normalizeFolder(value);
            rebuild();
          }),
        );
    }

    new Setting(containerEl).setName("Semantic search").setHeading();

    new Setting(containerEl)
      .setName("Search by meaning")
      .setDesc(
        "Also find notes by meaning, across Chinese and English, using embeddings that Ollama computes on this computer. Without Ollama, search uses keywords only.",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.semanticSearch).onChange((value) => {
          settings.semanticSearch = value;
          rebuild();
          this.plugin.scheduleSemanticRestart();
          this.display();
        }),
      );

    if (!settings.semanticSearch) return;

    new Setting(containerEl)
      .setName("Ollama address")
      .setDesc(
        isLocalUrl(settings.ollamaUrl)
          ? "Where Ollama runs. Notes are embedded on this computer."
          : "This address is not on this computer: your notes will be sent there to be embedded.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_OLLAMA_URL)
          .setValue(settings.ollamaUrl)
          .onChange((value) => {
            settings.ollamaUrl = value.trim() || DEFAULT_OLLAMA_URL;
            save();
            this.plugin.scheduleSemanticRestart();
          }),
      );

    new Setting(containerEl)
      .setName("Embedding model")
      .setDesc(
        createFragment((fragment) => {
          fragment.appendText("Download it once with ");
          fragment.createEl("code", { text: `ollama pull ${settings.embeddingModel}` });
          fragment.appendText(". Changing the model embeds every note again.");
        }),
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_EMBEDDING_MODEL)
          .setValue(settings.embeddingModel)
          .onChange((value) => {
            settings.embeddingModel = value.trim() || DEFAULT_EMBEDDING_MODEL;
            save();
            this.plugin.scheduleSemanticRestart();
          }),
      );

    const status = new Setting(containerEl)
      .setName("Index")
      .addButton((button) =>
        button.setButtonText("Retry").onClick(() => void this.plugin.restartSemantic()),
      );
    const render = () => {
      status.setDesc(describeStatus(this.plugin.semanticStatus()));
    };
    render();
    this.statusListener = render;
    this.plugin.configurationListeners.add(render);
  }

  override hide(): void {
    if (this.statusListener) this.plugin.configurationListeners.delete(this.statusListener);
    this.statusListener = null;
  }
}

function describeStatus(status: SemanticStatus | null): string {
  const keywordsOnly = "Search uses keywords only for now.";
  if (!status || status.state === "connecting") return "Connecting to Ollama…";
  if (status.state === "unavailable") return `${status.message} ${keywordsOnly}`;
  if (status.state === "ready")
    return `Ready: ${status.total} sections embedded. Search uses keywords and meaning.`;
  const ready = status.total > 0 && status.embedded / status.total >= READY_COVERAGE;
  return `Embedding notes: ${status.embedded} of ${status.total} sections. ${ready ? "Search already uses keywords and meaning." : keywordsOnly}`;
}
