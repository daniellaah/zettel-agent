/** Shapes returned by the page scripts in e2e/page/. */

export interface PluginState {
  loaded: boolean;
  version: string;
  provider: string;
  models: Record<string, string>;
  keysConfigured: Record<string, boolean>;
  notes: number;
  stages: Record<string, number>;
}

export interface AskResult {
  seconds: number;
  stop: string | null;
  error: string | null;
  answer: string;
  finalAnswer: string;
  tools: { name: string; summary: string | null; isError: boolean }[];
  thinkingChars: number;
  citedPaths: string[];
  unknownCitations: string[];
  usage: {
    requests: number;
    toolCalls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  } | null;
}

export interface UiState {
  userMessages: number;
  assistantMessages: number;
  markdownBlocks: number;
  toolRows: number;
  runningToolRows: number;
  citationChips: number;
  unknownChips: number;
  rawCitationsLeft: number;
  chipTitles: string[];
  internalLinks: number;
  unresolvedLinks: string[];
  footerButtons: string[];
  usageText: string | null;
  headerModel: string | null;
  starters: number;
  composerButton: string | null;
}
