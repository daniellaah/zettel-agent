import { PluginSettingTab, SecretComponent, Setting, type App } from "obsidian";

import type ZettelAgentPlugin from "../main";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../agent/providers/catalog";
import { STAGES, normalizeFolder, type Stage } from "../settings";

const CUSTOM_MODEL = "__custom__";

const STAGE_HINTS: Record<Stage, string> = {
  fleeting: "Quick captures. Never searched by the agent.",
  literature: "One source each, in your own words.",
  permanent: "One idea each, linked to others.",
  writing: "Outlines and drafts.",
};

export class SettingsTab extends PluginSettingTab {
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
  }
}
