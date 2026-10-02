# ADR-0014: Literature notes with source metadata and plain prose

- Status: Accepted
- Date: 2026-10-01
- Refines: ADR-0012’s literature scaffold
- Keeps: user-triggered creation, the read-only research tools, and fleeting exclusion

## Context

The owner requested literature notes that faithfully paraphrase selected source material without added evaluations or deductions. Source details belong in metadata; the body contains only a title and prose. A locator is not required. The initial multi-section reading summaries, main notes and entry map were deleted at the owner’s explicit request. The replacement batch contains four literature notes based on Ahrens’s book, each addressing an owner-selected topic.

## Decision

Use the following fixed literature fields: `type`, `created`, `source_title`, `author`, `year` and `source`. Source fields are optional at creation and may identify a DOI, URL or supplied PDF. Do not prepopulate reading questions, idea headings, locators, connections, aliases or tags. The creation dialog keeps the source inputs and opens the note below its H1 for writing.

The owner chooses the scope of a literature record. One source may support several topic-specific records; neither one-source-per-file nor one-file-per-reading-idea is imposed. The four current records paraphrase the book’s explanation of the system, fleeting notes, literature notes and main permanent notes. All four have `type: literature`; the topic of a record does not determine its stage.

Retain generic scalar/list frontmatter in `ParsedNote.properties`. Search and read responses include a bounded metadata excerpt inside the existing untrusted `<note>` wrapper. The metadata is tied to the same content hash as the cited section and cannot close the wrapper. This does not introduce source-specific retrieval rules or change BM25 weights; properties other than the existing title, aliases and tags are not new ranking fields.

No main notes, fleeting captures or entry maps are generated from this batch. Research on main-note creation remains a later task. The source PDFs are not copied into the repository.

## Validation

Tests verify the plain-body scaffold, metadata escaping, preserved source properties, source information delivered with evidence, wrapper safety and bounded metadata output. Obsidian creation tests verify the source form and the blank writing position. The fixture’s four notes are checked for English-only prose, literature stage and the absence of locators and extra headings.
