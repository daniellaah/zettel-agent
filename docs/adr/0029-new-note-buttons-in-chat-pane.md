# ADR-0029: New note buttons in the chat pane

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR-0012 (the chat host may open the creation dialog)
- Keeps: ADR-0008's read-only agent and ADR-0012's creation on form submission only

## Context

ADR-0012 added fixed-template note creation through three commands and a ribbon entry, and stated that `ChatHost` receives no creation capability. In use, the commands are hard to discover: someone reading an answer in the chat pane has no visible way to start a fleeting, literature or permanent note. The owner asked for obvious buttons in the pane.

## Decision

- Add a New note button to the chat header, which opens a menu of the three note types, and the same three choices as cards in the empty chat.
- Give `ChatHost` one method, `openNoteDialog(kind)`. It only opens the ADR-0012 dialog with that type selected. The note is still created only when the user submits the form; the host has no method that creates, names or fills a note.
- Call `openNoteDialog` only from click handlers on these buttons. It must not be called from Markdown rendering, citation or link handlers, or anything driven by model output. `ChatSession` and the agent's tool context still receive nothing.
- The dialog is not pre-filled from the conversation. Agent answers still enter notes only through Copy or Insert-at-cursor.

## Consequences

- Note creation is discoverable from the pane without weakening the read-only agent: a model cannot open the dialog, and opening it writes nothing.
- ADR-0012's sentence that `ChatHost` receives no creation capability now reads: `ChatHost` can open the dialog and nothing more.
- The chat tree now holds a path to a write dialog, so reviews of the pane must check that new handlers for model-rendered content do not reach `openNoteDialog`.
