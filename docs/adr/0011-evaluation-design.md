# ADR-0011: Offline evaluation on a synthetic, question-first fixture vault

- Status: Proposed
- Date: 2026-10-01

## Context

What exists:

- The fixture vault holds 55 Zettelkasten notes and 3 journal notes.
- `eval/judgments.draft.json` has 40 queries with binary relevance that nobody has verified. `npm run eval` scores them with BM25 alone.
- Answer quality is measured only by the 9 scenarios in `npm run e2e`. That command launches Obsidian, and it scores only the share of expected notes that the answer cited.

Problems:

- **The vault is too small.** With 55 notes, BM25 ranking is easy, and `list` with `preview` shows the whole vault in one call. Neither retrieval nor context management is under real pressure.
- **Answers are barely checked.** Citing an expected note does not show that the note supports the claim it is attached to. Key facts are not checked, and neither is honesty about partial answers. Each behaviour rule has at most one scenario.
- **Many answers can come from the model's own knowledge.** Literature notes summarise real papers; RRF's k = 60 is one example. A correct answer therefore does not prove that the notes were used.
- **Results are noisy.** With 9 scenarios run once each, the noise is larger than the signal.
- **It is coupled to the UI.** Running answer evaluation through Obsidian is slow, and it ties quality measurement to the interface.

## Decision

- **Two layers, two files under `eval/`.**
  - The retrieval set maps each query to graded relevant notes. It has 120–150 queries, costs nothing to run and gives the same result every time.
  - The answer set has about 60 questions, each with a rubric, and runs without a UI.
  - Formats and metrics are in `eval/README.md`.
- **Headless answer evaluation.** `npm run eval:agent` runs `runTurn` in Node on the fixture corpus against live providers, the same way the replay tests already run offline. `npm run e2e` keeps the UI and behaviour checks; its quality scenarios move into the answer set.
- **Rebuild the vault from scratch** at about 250 Zettelkasten notes.
  - The owner chooses the topics and provides the sources (papers, books, documentation, blog posts) that the notes' facts come from.
  - Questions are written before the notes that answer them.
  - The first vault is kept at git tag `fixture-vault-v1`.
  - The corpus spec is in `fixtures/vault-design.md`.
- **Metrics follow established practice.**
  - Retrieval is scored the TREC/BEIR way: graded relevance and pooling.
  - Answers are scored on:
    - claim-level citation recall and precision, as in ALCE;
    - coverage of key points;
    - honest refusal when the notes do not cover the question;
    - behaviour violations.
  - Judgments that need understanding come from an LLM judge, which is first calibrated against the owner's own labels.
- **Note-only items.** At least a third of the answer items need facts that exist only in the notes: personal results, personal opinions, or conclusions that go against common knowledge. They are reported separately.
- **Dev and test splits**, 70/30. The test split is used only at checkpoints and never for tuning.
- **Repeated runs.** Each answer item runs 3 times. Reports give the mean with a bootstrap 95% CI, and variants are compared on the same items.

## Alternatives considered

- **Use the owner's real vault as the corpus.** It is the most realistic option, but it is private, cannot be committed and has no known ground truth. It is kept for later, as a read-only spot check: about 20 questions, graded by the owner, to see whether fixture scores carry over.
- **Grow the first vault in place.** Its topics were not chosen by the owner, so the owner could not judge its notes and answers. Its literature notes summarised sources from memory rather than from the source text.
- **Use a public benchmark** such as BEIR or HotpotQA. None of them has wikilinks, stages, aliases or mixed Chinese and English, and none tests the agent's behaviour rules.
- **Generate notes first and write questions afterwards.** Test properties could not be placed on purpose, and the questions would drift towards easy lookups.
- **Use an off-the-shelf framework** such as RAGAS or ARES. They are built for retrieve-then-generate pipelines, and they are written in Python. We borrow their metric definitions, not their code.

## Consequences

- **Some things stay stale until the new vault is ready:**
  - the e2e scenarios, which expect notes from the first vault;
  - the retrieval numbers in `README.md`, which were measured on the first vault;
  - the cassettes in `fixtures/recordings/` (ADR-0010).

  Their replay tests still pass, because they check the wire format and how the loop consumes a recording, not the note content. All three are redone once the new vault and its eval sets exist.

- **Answer runs cost money.** Every `eval:agent` run calls live APIs, for the agent and for the judge. The report prints the cost, and the pilot cluster sets the first estimate.
- **The judge is pinned to a model id.** Changing the judge model or the judge prompt means calibrating again, and scores from before the change can no longer be compared.
- **The corpus is synthetic,** and an LLM writes both the notes and the questions, so the questions may borrow the notes' wording. Three things counter this:
  - questions are written first;
  - a share of the questions must have low word overlap with their target notes;
  - the owner contributes real questions, and the real vault gets a spot check later.
- **Small differences are noise.** With 60 answer items, a difference under about 10 points is within the noise.
