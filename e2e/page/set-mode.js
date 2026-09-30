// Sets the offline mode in memory only; returns the previous mode.
const settings = app.plugins.plugins["zettel-agent"].settings;
const previous = settings.recordingMode;
settings.recordingMode = args.mode;
return previous;
