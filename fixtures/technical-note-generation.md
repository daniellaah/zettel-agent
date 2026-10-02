# Technical reading corpus, 2026-10-02

Completed: **318 English notes: 137 literature and 181 permanent**. The unchanged Ahrens baseline contributes four literature and one permanent note. The technical corpus contributes 133 literature and 180 permanent notes from 45 original works.

## Existing corpus repairs

The review split five literature records into ten focused records: entanglement versus correction cascades, unstable versus underutilized dependencies, undeclared consumers versus feedback loops, metric taxonomy versus sample-ratio mismatch, and compaction versus persistent notes. Affected permanent-note sources were narrowed to the relevant concepts. Two interpretive additions in MIND literature were removed. Seven literature notes now preserve individual author bylines. Eighteen original arXiv PDFs were checked against fixed version downloads; all hashes matched, including HNSW v4. Mutable HTML has explicit snapshot dates and reproducibility limits in the external audit.

These repairs increased the existing corpus from 213 to 218 notes. The owner then authorized continuing the discussed five-theme expansion.

## Additional 100 notes

Batches 9–13 add **40 literature and 60 permanent notes** from 11 additional works. Their literature records were written from downloaded original passages, not model memory. Permanent thoughts develop implications, assumptions and connections while identifying their literature origins. No owner experiments, project results or experience are invented. The counts are achieved through distinct concepts; no fixed minimum word count is imposed.

| Batch | Theme | Literature | Permanent |
|---|---|---:|---:|
| 1 | Dual towers, sampling correction and ANN | 12 | 18 |
| 2 | Multi-interest and sequence retrieval | 9 | 12 |
| 3 | Collaborative filtering, Swing and FM | 9 | 12 |
| 4 | ML engineering and experiment evaluation | 17 | 15 |
| 5 | ML/DL fundamentals | 12 | 15 |
| 6 | Information retrieval and RAG | 10 | 15 |
| 7 | Agents and evaluation | 11 | 15 |
| 8 | LLM adaptation, reasoning and serving | 13 | 18 |
| 9 | Statistical learning and tree boosting | 10 | 15 |
| 10 | Pairwise ranking, sequential recommendation and contrastive learning | 10 | 15 |
| 11 | Production ML and stateful streaming | 8 | 12 |
| 12 | Attention IO and speculative decoding | 6 | 9 |
| 13 | Late-interaction retrieval and repository-task evaluation | 6 | 9 |

The [source catalog](vault-sources.md) and [audit](technical-note-audit.json) retain source identities, edition links, passage scopes, note hashes and baseline hashes outside the research corpus. Book and blog years do not identify later page revisions. Raw source downloads are not distributed in this repository.

## Evaluation status

This is a learning corpus, not a judged benchmark. Independent questions, relevance labels, dev/test partitions, no-answer cases and calibrated answer rubrics remain to be authored. No provider model API calls or LLM judging were used for the repairs or expansion.

## Validation

All five expansion batches passed `npm run check` with 188 unit tests. The final corpus passes English-only, exact metadata, title, source identity, audited note hash, resolved link and preserved-baseline checks. Final `npm run check` passes typecheck, ESLint, Prettier and 188 unit tests. The focused Obsidian run of `plugin.e2e.ts` and `note-creation.e2e.ts` passes all 12 tests without model calls. The actual retrieval corpus indexes all 318 notes, resolves all 267 wikilink occurrences and returns hits for fourteen old and new topic queries. This smoke test is not a judged relevance benchmark. All 57 downloaded source documents match their recorded hashes, every arXiv source has a fixed version link, all note metadata matches the source records, and the five baseline hashes remain unchanged. Temporary creation-test notes were cleaned up. `git diff --check` passes.
