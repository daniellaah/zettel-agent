import { addIcon } from "obsidian";

/** The plugin's own mark: index cards standing in a slip box. */
export const BRAND_ICON = "zettel-agent-slip-box";

// Drawn on Lucide's 24-unit grid with its 2-unit round stroke, then scaled to the
// 100-unit box that addIcon expects, so it sits naturally beside Obsidian's icons.
const SLIP_BOX = `<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h18v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M7.2 14 5.6 6.6l3.9-.8L11 14"/><path d="M11 14V4.5h4V14"/><path d="M15 14l1.1-7.9 3.6.6-1.2 7.3"/></g>`;

export function registerBrandIcon(): void {
  addIcon(BRAND_ICON, SLIP_BOX);
}
