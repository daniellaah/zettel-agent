# ADR-0012: Fixed-template note creation from user commands

- Status: Accepted
- Date: 2026-10-01
- Keeps: ADR-0008's read-only agent and user-controlled authorship

## Context

The plugin can search notes and help users think through them, but has no commands for creating fleeting, literature or permanent notes. The owner requested a fixed-template creation workflow that does not involve the agent.

Schmidt's account of Luhmann's card index and Ahrens's _How to Take Smart Notes_ distinguish brief, selective literature records from the independently understandable ideas in the main slip-box. One literature source can contain several selected ideas. The one-idea constraint applies to the content of each literature section and to each permanent note; it does not require splitting every literature section into a separate file.

## Decision

- Add three Obsidian commands and a ribbon entry. They open a creation dialog with a note type, title, destination and optional source information.
- Use fixed scaffolds bundled with the plugin; no model requests, executable templates or generated prose.
  - **Fleeting:** type, local creation date, inbox tag and title; free writing below it.
  - **Literature:** source metadata, original link, reading question and an initial idea section with a locator. The user renames the heading and adds more idea sections as needed. Sections remain independently searchable and citable without imposing a word count or exhaustive summary.
  - **Permanent:** one claim as the title, free writing below it, sources and connections. A connection should have a reason. The user may explicitly select the open Zettelkasten note as a source; this is off by default and is not a claim that the source supports a finished argument.
- Create the note only on form submission, within the configured Zettelkasten and stage folders. Create missing destination folders, reject unsafe paths and refuse existing filenames, including case variants. Never overwrite, rename or remove existing notes.
- Open the new note in the editor at its writing position. The user writes the actual content and relationships.
- Keep the creation implementation in `ui/`. Neither `ChatSession`, `ChatHost` nor the agent's tool context receives a creation capability. Agent answers still enter notes only through user-triggered Copy or Insert-at-cursor. Unresolved agent links still cannot create files.
- Retrieval continues to use generic headings, properties and links, without recognizing these fixed templates. Decode JSON-quoted YAML scalars so source titles with quotes retain their meaning in the index.

## Consequences

- A user can create all three note types without an API key or model cost.
- Creation adds a user-owned write path to the plugin, not to the agent. It must not be exposed as a model tool or triggered by model output.
- The scaffold supports sources and connections but cannot enforce atomicity, understanding or worthwhile relationships. Those remain the user's judgments.
- Custom templates and automatic conversion of existing notes are outside this change. The original note remains untouched when the user creates a new note from it.
