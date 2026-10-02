# ADR-0016: Source-grounded learning before evaluation questions

- Status: Accepted
- Date: 2026-10-02
- Refines: ADR-0011 corpus-construction proposal
- Keeps: ADR-0013 research scope and ADR-0014/0015 minimal note templates

## Context

The owner is practicing Zettelkasten note making to build a useful technical learning corpus for MLE/AI interviews and later evaluate Zettel Agent. Literature records must come from authoritative passages actually read. Predetermined answer coverage must not shape their claims or vocabulary.

## Decision

Create literature records first by faithfully paraphrasing focused concepts from original papers, published books, official documentation or research-team articles. Develop separate atomic permanent thoughts with literature links as their sources. Preserve bibliographic identity in note metadata and keep canonical URLs, downloaded editions, passage scopes and hashes in an audit outside the indexed vault.

Use note-count targets as budgets. Split independent concepts when needed; never invent facts or owner experience to meet a target. Generate no fleeting notes, artificial index, robustness payloads or personal experiment results in the learning corpus. Preserve the approved Ahrens baseline.

Only after corpus authoring is complete should independently worded evaluation questions, reviewed relevance judgments and grounded rubrics be created. Freeze test items before tuning and recheck affected judgments when corpus content changes. Robustness fixtures can be isolated later without changing source paraphrases into artificial evidence.

Authoring is an explicitly requested external fixture task. It introduces no agent write tool or model-powered note-creation path. During generation, source retrieval and local validation do not call configured model APIs. Paid answer evaluations and model judging remain a separate later activity.

## Validation

The completed corpus contains 88 new technical literature records and 120 permanent notes, plus the five unchanged baseline notes. Local checks validate metadata, English-only content, note hashes, passage records and resolved links. Focused Obsidian indexing and manual-creation tests are run separately from live-model tests.
