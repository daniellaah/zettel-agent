# ADR-0013: Exclude fleeting captures from the research corpus

- Status: Accepted
- Date: 2026-10-01
- Keeps: ADR-0008’s read-only agent and ADR-0012’s user-triggered creation

## Context

The owner requested that fleeting notes not be retrieved. Captures previously entered the same corpus as literature, permanent and writing notes, so filtering only keyword search would still expose them through matching, listing, reading and link traversal.

## Decision

Exclude notes whose effective stage is `fleeting` at `Corpus.upsert`, before storing or indexing them. As before, a recognized frontmatter `type` overrides the folder stage. A literature note in the fleeting folder remains researchable; a note marked fleeting in the permanent folder is excluded.

When an indexed note becomes fleeting, remove its existing index entry and invalidate the graph. Moving it back to a research stage makes it available again. Vault files are never altered by this operation.

All research tools, note mentions and active-note context use this corpus. A reference to an excluded capture has no research destination and is treated as unresolved. Exclusion does not remove the name of a link from another note. Previously saved conversation text is not retroactively deleted.

The tool stage filters offer literature, permanent and writing. The system prompt describes the exclusion, and the chat no longer suggests surveying fleeting notes. The user can still create and edit captures through the fixed-template commands; these captures remain outside research.

The fixture dataset uses English-only notes, aliases and evaluation questions. It contains no generated fleeting notes. Main notes are selected for useful independent claims rather than automatically produced for every reading section.

## Validation

Unit checks cover folder and metadata classification, all five research tools, transitions in both directions, renaming, stale index entries, graph edges and per-turn context. Obsidian creation checks confirm that a user-created fleeting note opens successfully while remaining absent from the corpus.

## Consequences

The research boundary is shared by live Obsidian indexing and offline fixture loading. Short-lived reminders do not become research evidence merely because their text matches a query. The creation workflow still supports capturing an idea without requiring a model.
