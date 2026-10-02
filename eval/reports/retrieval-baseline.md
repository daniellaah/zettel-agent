# Retrieval development baseline

Corpus: learning-v1-790b1b2bb6c7; 318 frozen notes (137 literature, 181 permanent).

20 English synthetic development queries; 12 answer rubrics validated but not executed. 410 query-note judgments. Review: author-reviewed; owner-review-pending.

This pilot measures lexical retrieval only. It is not a held-out score, an owner-reviewed gold standard, or a measure of answer correctness. Labels were pooled from the current three tokenizer modes at depth 20 and supplemented with known supporting notes; another retriever can surface unjudged relevant notes. API calls: 0.

Recall counts grades 1 and 2. MRR@10 uses only queries with a grade-2 note. nDCG@10 uses linear graded gain (0, 1, 2). No-answer queries have no positive denominator and are excluded from quality averages; returned matches are shown separately. Unknown candidates have zero gain provisionally and are counted as unjudged.

| Mode    | Group            | Items | Recall items | MRR items |   R@5 |  R@10 | MRR@10 | nDCG@10 | Unjudged top-10 |
| ------- | ---------------- | ----: | -----------: | --------: | ----: | ----: | -----: | ------: | --------------: |
| words   | all              |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |
| words   | kind:lookup      |     4 |            4 |         4 | 87.5% | 87.5% | 100.0% |   94.5% |               0 |
| words   | kind:paraphrase  |     4 |            4 |         4 | 70.8% | 70.8% |  70.8% |   75.4% |               0 |
| words   | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| words   | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| words   | kind:no-answer   |     4 |            0 |         0 |     — |     — |      — |       — |               0 |
| words   | split:dev        |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |
| bigrams | all              |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |
| bigrams | kind:lookup      |     4 |            4 |         4 | 87.5% | 87.5% | 100.0% |   94.5% |               0 |
| bigrams | kind:paraphrase  |     4 |            4 |         4 | 70.8% | 70.8% |  70.8% |   75.4% |               0 |
| bigrams | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| bigrams | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| bigrams | kind:no-answer   |     4 |            0 |         0 |     — |     — |      — |       — |               0 |
| bigrams | split:dev        |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |
| both    | all              |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |
| both    | kind:lookup      |     4 |            4 |         4 | 87.5% | 87.5% | 100.0% |   94.5% |               0 |
| both    | kind:paraphrase  |     4 |            4 |         4 | 70.8% | 70.8% |  70.8% |   75.4% |               0 |
| both    | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| both    | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| both    | kind:no-answer   |     4 |            0 |         0 |     — |     — |      — |       — |               0 |
| both    | split:dev        |    20 |           16 |        15 | 77.2% | 81.8% |  88.9% |   85.5% |               0 |

## Missed supporting notes at ten (both)

- **r04** (50.0%): Which probability must LogQ estimate for interaction-sampled minibatch negatives?
  - 02-Zettelkasten/Literature/Streaming estimation of item sampling probabilities.md
  - 02-Zettelkasten/Permanent/Streaming frequency estimates can drift through hash collisions.md
- **r05** (50.0%): If an attention implementation is mathematically exact, must it produce bit-for-bit identical floating-point results?
  - 02-Zettelkasten/Literature/Blockwise softmax accumulation in FlashAttention.md
- **r07** (33.3%): Can a perfect second-stage ranker recover a relevant item omitted by the first-stage retriever?
  - 02-Zettelkasten/Literature/Candidate generation and ranking at YouTube.md
  - 02-Zettelkasten/Permanent/ANN approximation adds a separate source of retrieval loss.md
  - 02-Zettelkasten/Permanent/Candidate aggregation is a separate serving decision.md
  - 02-Zettelkasten/Permanent/Candidate filtering can exclude a document with a competitive aggregate score.md
- **r09** (75.0%): How can compaction and external task notes preserve progress without guaranteeing that needed details will be used later?
  - 02-Zettelkasten/Permanent/Persistent memory requires a retrieval decision as well as storage.md
- **r10** (66.7%): Does exporting preprocessing with a TFX model establish complete training-serving parity?
  - 02-Zettelkasten/Literature/Simple models and independent infrastructure tests.md
  - 02-Zettelkasten/Permanent/Identical-example score checks isolate an engineering boundary.md
- **r12** (66.7%): Does probing more IVF lists also eliminate the distance approximation introduced by product quantization?
  - 02-Zettelkasten/Literature/Inverted-file pruning in Faiss similarity search.md
- **r15** (66.7%): Is an answer grounded merely because it is factually correct and contains citation markers?
  - 02-Zettelkasten/Permanent/Retrieval coverage and evidence use need separate measurements.md
  - 02-Zettelkasten/Permanent/Strong token matches do not establish a coherent supporting claim.md

## No-answer candidates (both)

- **r17**: Which draft lookahead was measured to give the lowest latency in our production service? Top matches: Acceptance cost and lookahead in speculative speedup; Speculative lookahead has a workload-dependent optimum; A better draft model is one that agrees with the target distribution. These do not establish the requested owner fact.
- **r18**: Do these notes record the online CTR uplift from my SASRec deployment? Top matches: A retrieval deployment includes the model and its item index; An aggregate uplift can conceal a transient novelty effect; Literature notes. These do not establish the requested owner fact.
- **r19**: What learning rate did I choose for my own BPR production training run? Top matches: Observed and unobserved item comparisons in BPR; Pairwise logistic likelihood and priors in BPR; A learned interest slot does not supply its own semantic label. These do not establish the requested owner fact.
- **r20**: Which GPU model and cluster size did I use for my GRPO training experiment? Top matches: GPU search throughput must be interpreted with its batch size; Removing the critic shifts GRPO cost toward sampled comparisons; Group-relative advantages in GRPO. These do not establish the requested owner fact.

## Interpretation and next step

English-only tokenization does not test CJK behavior. Broad supporting-label recall can be low even when a sufficient note ranks first, so inspect Recall, MRR and per-item misses together. No performance threshold is imposed on this first baseline; invalid fixtures fail the run, quality changes are reported.

Review labels and rubrics, expand topic and phrasing coverage, freeze question-family-separated test items before tuning, then run the production agent loop and a calibrated judge under a separately approved API budget. Injection and fleeting-scope fixtures remain separate from this learning corpus.

Reproduce with `npm run eval`. Machine-readable rankings, configuration hashes and denominators are in `retrieval-baseline.json`. Each run replaces these two reports without modifying the corpus or annotations.
