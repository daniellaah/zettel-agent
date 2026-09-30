// Plugin and vault state. Checks whether API keys exist without reading them.
const plugin = app.plugins.plugins["zettel-agent"];
if (!plugin) return { loaded: false };
await plugin.vaultCorpus.whenReady();
const corpus = plugin.vaultCorpus.current;
const stages = {};
for (const path of corpus.paths()) {
  const stage = corpus.stage(path) ?? "other";
  stages[stage] = (stages[stage] ?? 0) + 1;
}
const { provider, models, apiKeySecretIds } = plugin.settings;
return {
  loaded: true,
  version: plugin.manifest.version,
  provider,
  models,
  keysConfigured: Object.fromEntries(
    Object.entries(apiKeySecretIds).map(([id, secretId]) => [
      id,
      Boolean(secretId) && app.secretStorage.getSecret(secretId) !== null,
    ]),
  ),
  notes: corpus.size,
  stages,
};
