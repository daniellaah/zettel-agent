# ADR-0015: Permanent notes with source metadata and free prose

- Status: Accepted
- Date: 2026-10-01
- Refines: ADR-0012’s permanent scaffold
- Keeps: user-triggered creation, read-only research tools and the current four literature records

## Context

The owner approved a minimal permanent-note template after discussing Ahrens’s advice: one idea per note, expressed in full sentences and understandable without the original reading context. Sources preserve provenance, while meaningful connections express how ideas relate. Obsidian supports links in both metadata and prose; neither a physical index nor fixed relationship headings are required for every new note.

## Decision

Use only `type: permanent`, `created` and `source: []` as default metadata. The source property is always a list. An explicitly selected open source note is added as one quoted list entry. It is not selected by default, duplicated in the body or suggested by the model.

Sources identify the origins or evidence of the idea. Entries may link literature records or directly identify books, papers or URLs. Multiple entries can be added manually; an independent thought can keep the empty list. An existing note mentioned as a related idea is not automatically a source.

The body starts with the title and blank writing space. The title states a concrete claim or question. The author develops one independently understandable idea and explains any related-note links naturally in the prose. Do not prepopulate Sources or Connections headings, aliases, tags, an index or a required number of links. Keep the plugin scaffold and manual Obsidian template consistent.

This is our digital template design informed by the book, not a format prescribed by Ahrens. The creation dialog remains a fixed-template user action with no model calls. Research retrieval continues to use generic metadata and links; no source-specific ranking rules or agent write capabilities are introduced. This change creates no permanent dataset notes.

## Validation

Unit tests verify the three default fields, list-valued source links, empty sources, plain body and writing cursor. Focused Obsidian tests exercise both empty and explicitly selected sources without invoking a model. The fixture remains four literature notes after test cleanup.
