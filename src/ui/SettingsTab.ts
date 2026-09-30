import { PluginSettingTab, SecretComponent, Setting, type App } from "obsidian";

import type AgenticZettelkastenPlugin from "../main";
import { MODELS, STAGES, normalizeFolder } from "../settings";

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: AgenticZettelkastenPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc(
        "Stored in Obsidian's secret storage, not in the plugin's data file. Your questions and the note excerpts the agent reads are sent to Anthropic.",
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(settings.apiKeySecretId).onChange((id) => {
          settings.apiKeySecretId = id;
          void this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Model").addDropdown((dropdown) => {
      for (const model of MODELS) dropdown.addOption(model.id, model.label);
      dropdown.setValue(settings.model).onChange((model) => {
        settings.model = model;
        void this.plugin.saveSettings();
      });
    });

    new Setting(containerEl).setName("Zettelkasten").setHeading();

    new Setting(containerEl)
      .setName("Zettelkasten folder")
      .setDesc("Vault-relative folder the agent searches. Leave empty for the whole vault.")
      .addText((text) =>
        text
          .setPlaceholder("02-Zettelkasten")
          .setValue(settings.zettelkastenRoot)
          .onChange((value) => {
            settings.zettelkastenRoot = normalizeFolder(value);
            void this.plugin.saveSettings();
            this.plugin.scheduleRebuild();
          }),
      );

    for (const stage of STAGES) {
      new Setting(containerEl)
        .setName(`${stage[0]!.toUpperCase()}${stage.slice(1)} notes folder`)
        .setDesc("Sub-folder of the Zettelkasten folder.")
        .addText((text) =>
          text.setValue(settings.stageFolders[stage]).onChange((value) => {
            settings.stageFolders[stage] = normalizeFolder(value);
            void this.plugin.saveSettings();
          }),
        );
    }
  }
}
