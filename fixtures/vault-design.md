# Fixture vault design

Status: **137 literature notes and 181 permanent notes (318 total).** The technical corpus contains 133 literature and 180 permanent notes from 45 works across thirteen batches. Five multi-concept literature notes were split during the latest review, increasing the pre-expansion corpus from 213 to 218. The subsequent expansion added exactly 40 literature and 60 permanent notes. The four Ahrens literature notes and previously approved permanent note remain byte-for-byte unchanged. All notes and metadata are English, with no fleeting dataset captures, entry maps, writing or journal notes. Templates and Obsidian configuration are retained. The original v1 corpus remains available at git tag `fixture-vault-v1`.

The vault serves three uses: development, evaluation and e2e tests. It is also meant to be worth reading as a real Zettelkasten.

## Principles

- **The owner chooses the topics.** Every topic is one the owner knows well enough to judge whether a note or an answer is right.
- **English only.** Notes, aliases and evaluation questions contain no Chinese. The owner requested no generated fleeting notes for the dataset.
- **Read authoritative sources before writing:** owner-provided works or original papers, published books, official documentation and author or research-team articles selected for the approved topics. Literature records faithfully paraphrase a focused concept without adding opinions or deductions. Permanent notes develop a separate, independently understandable thought from those records; they are not attributed as the owner's project experience.
- **Notes paraphrase their sources.** The repository is public, so notes summarise sources in their own words, are much shorter than the source and quote at most a short sentence, with attribution.
- **No false facts.** The test properties below are states that real vaults are in anyway:
  - views that disagree;
  - earlier views that a later note revises;
  - untrusted text inside web clippings;
  - links to notes not written yet;
  - unfinished arguments in durable drafts.

  The only deliberate inaccuracy is metadata, such as a frontmatter `type` that does not match the folder.
- **Frozen once judged.** After the eval sets are written, a note is added or changed only together with a re-check of the judgments it might affect (pooling; see `eval/README.md`).

## Layout

| Folder | Content |
|---|---|
| `02-Zettelkasten/` | The Zettelkasten root, set as `zettelkastenRoot`; no generated index notes. |
| `02-Zettelkasten/Fleeting/` | Retained for user capture creation; outside research scope and empty in this dataset |
| `02-Zettelkasten/Literature/` | Topic-specific faithful paraphrases with source metadata |
| `02-Zettelkasten/Permanent/` | One idea each, declarative titles, links with reasons |
| `02-Zettelkasten/Writing/` | Outlines, drafts and ideas built from permanent notes |
| `01-Journal/` | Daily notes outside the Zettelkasten root. They act as distractors, and they test the scope boundary. |

The stage of a note comes from its folder. A frontmatter `type` overrides it. Notes whose effective stage is fleeting are excluded from every research tool ([ADR-0013](../docs/adr/0013-exclude-fleeting-from-research.md)).

## Topics

The approved technical plan targets roughly 80 literature and 120 permanent notes to support MLE/AI interview study and later agent evaluation. Counts are budgets rather than reasons to pad or merge ideas. The first complete batch contains 88 and 120 after atomicity review.

| Batch | Theme | Literature | Permanent |
|---|---|---:|---:|
| 1 | Dual towers, sampling correction and ANN | 12 | 18 |
| 2 | Multi-interest and sequence retrieval | 9 | 12 |
| 3 | Collaborative filtering, Swing and FM | 9 | 12 |
| 4 | ML engineering and experiment evaluation | 13 | 15 |
| 5 | ML/DL fundamentals | 12 | 15 |
| 6 | Information retrieval and RAG | 10 | 15 |
| 7 | Agents and evaluation | 10 | 15 |
| 8 | LLM adaptation, reasoning and serving | 13 | 18 |

The original Ahrens cluster remains as the methodological baseline. Technical sources, reading passages, downloaded-edition identifiers and note hashes are recorded in [`technical-note-audit.json`](technical-note-audit.json), outside the indexed vault. See [`technical-note-generation.md`](technical-note-generation.md) for the completed scope and validation. Future topics can extend this corpus; the historical LangChain proposal is not an active note-generation instruction.

## Note templates

The templates live in `fixtures/vault/Templates/`, outside the Zettelkasten root, so they are not indexed. To use them in Obsidian, set the Templates core plugin's folder to `Templates`. The listings below show their structure; the files use `{{title}}` and `{{date}}` placeholders.

### Literature notes

The owner’s accepted template follows Ahrens’s advice to select useful source content, paraphrase it faithfully and keep bibliographic identity with the record (§2.1 and §10.1). The record adds no personal evaluation, deductions or Obsidian-specific advice. A source may have several topic-specific records. The book does not impose a digital file-granularity rule.

```markdown
---
type: literature
created: {{date:YYYY-MM-DD}}
source_title: ""
author: ""
year: ""
source: ""
---

# {{title}}

Faithful paraphrase of the selected source material.
```

- Source information is kept entirely in frontmatter. In this dataset, `source` identifies the published work by its formal title; canonical URLs and document-edition details remain in the external audit. A supplied PDF is reading material, not the source identity; do not use its local filename for these records.
- The body contains one H1 and continuous prose. Do not prepopulate idea headings, reading questions, bibliographic paragraphs, evaluations or connections.
- There is no fixed word count, number of paragraphs or number of reading ideas. Preserve enough argument and qualification to convey the selected material accurately.
- No `locator` is required or generated. Source passages used during authoring can be recorded outside the vault as an audit trail.
- Notes and metadata are English-only. Do not insert tags, aliases or query vocabulary simply to increase retrieval scores.
- Search and read tools include a bounded generic metadata excerpt inside the untrusted note wrapper, so bibliographic information remains available with evidence. See [ADR-0014](../docs/adr/0014-literature-notes-with-source-metadata.md).

### Other note types

Permanent (one independently understandable idea per note):

```markdown
---
type: permanent
created: {{date:YYYY-MM-DD}}
source: []
---

# {{title}}

One coherent idea, with enough explanation to remain understandable later. Explain meaningful related-note links naturally in the prose.
```

The title states a concrete claim or question. `source` is a list of origins or evidence: literature-note links, direct book or paper references, or URLs. It may be empty for an independent thought and may contain multiple sources. Related notes are not automatically sources. Do not prepopulate Sources or Connections headings, aliases, tags, an index or a required number of links. The manual template and plugin command both open below the H1 for free writing. This format is our Obsidian implementation of Ahrens’s advice (§2.1, chapter 6 and §12.7), not a YAML format specified by the book. See [ADR-0015](../docs/adr/0015-permanent-notes-with-source-metadata.md).

| Stage | Template |
|---|---|
| Fleeting | Only `type`, `created` and `tags: [inbox]`. Free text, no fixed headings. |
| Writing | `status: idea / outline / draft`. Free structure, linking the permanent notes it uses. |
| MOC | `tags: [moc]`. Entry links grouped under headings. |
| Journal | `date` and `tags: [journal]`. |

The plugin reads these generic Obsidian structures, and nothing else:

- frontmatter `type`, `aliases` and `tags`, plus generic scalar/list properties retained for source visibility;
- `[[links]]` in frontmatter properties;
- headings, because a heading section is the unit that is indexed and cited;
- wikilinks;
- inline tags.

Retrieval must keep relying only on these generic structures, never on this vault's templates. Users' vaults follow their own conventions, and the plugin has to work on them.

## Required test properties

The full evaluation corpus is planned to contain the properties below. They are future targets, not requirements to pad a source-grounded reading pilot with invented personal facts or artificial notes. Each instance will be recorded in a ground-truth table in this file.

| Property | Count | Notes |
|---|---|---|
| Multi-hop chain | ≥ 2 | Follows existing links A → B → C. At least one chain crosses clusters. A contains none of C's answer terms (checked by grep). |
| Views in tension | ≥ 1 | Two notes that disagree, both defensible and not linked to each other. |
| Revised view | ≥ 1 | An earlier source or main note records a view, and a later main note revises it with evidence. Do not invent the owner’s history. |
| Should-link pair | 1–2 | No link in either direction, although the two belong together. At least one pair crosses clusters. |
| Orphan permanent note | 1 | No links in or out, and not listed in any MOC. |
| Alias-only term | ≥ 1 | Appears only in one note's `aliases:`. |
| Rare single term | ≥ 1 | Appears in exactly one note. |
| Note-only facts | ≥ 3 | Facts a model cannot know without the notes: the owner's own results, judgments or decisions. These back the `noteOnly` answer items. |
| Long note | 1 | A writing note (draft) of at least 1000 words, with H2 and H3 sections. Literature notes are short by design. |
| Shared lure terms | ≥ 3 | The same term used in another cluster with a different meaning. |

Corpus-wide:

- three prompt-injection lines in web clippings, in different forms: a plain instruction, a fake "note to AI assistants", and an HTML comment;
- three unresolved links;
- one frontmatter `type` that disagrees with its folder;
- inconsistent tag spellings;
- several hub notes, only some of them listed in the index;
- journal notes that use cluster terms.

## Ground truth

### Current batch: Ahrens literature records

- Four owner-selected topics: Zettelkasten note system, fleeting notes, literature notes and permanent notes.
- Each note has the six agreed metadata fields, one H1 and prose only. Each is a literature record regardless of its topic.
- [Source audit](vault-sources.md) records the book sections used to check the paraphrases. The notes contain no generated locators.
- All six notes from the earlier pilot were deleted at the owner’s request. Earlier search results and provisional questions are superseded.
- One permanent note was created from the exact draft approved by the owner. This baseline is unchanged by the technical batch. No fleeting captures, entry maps, synthetic personal facts or robustness payloads were generated. Graded evaluation remains deferred.

### Technical reading batch, 2026-10-02

- 34 authoritative works support 88 focused literature records and 120 independent permanent thoughts.
- Literature metadata has six fields; permanent metadata has three, with source links to literature records. Notes have one H1 and prose only.
- All generated content is English. Permanent thoughts distinguish synthesis from source paraphrase and make no claims about owner experiments or project results.
- This batch does not satisfy every future robustness property above. Those properties must not be manufactured by changing faithful reading records.
- Dataset content was written before evaluation questions. No paid model calls, agent answer runs or LLM judging were performed during generation.
