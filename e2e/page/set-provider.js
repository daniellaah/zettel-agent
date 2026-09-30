// Switches provider (and optionally model) in memory only; returns the previous values.
const settings = app.plugins.plugins["zettel-agent"].settings;
const previous = { provider: settings.provider, model: settings.models[args.provider] };
settings.provider = args.provider;
if (args.model !== undefined) settings.models[args.provider] = args.model;
return previous;
