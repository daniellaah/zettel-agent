# Retrieval development baseline

Corpus: learning-v1-790b1b2bb6c7; 318 frozen notes (137 literature, 181 permanent).

120 English synthetic queries with the declared family-separated splits; 60 answer rubrics validated by this retrieval-only command. Live answer execution is reported separately. 1000 query-note judgments. Review: ai-reviewed; human-review-not-performed.

This evaluation measures lexical retrieval only. Expanded test source families were frozen before model runs and isolated from development; labels are AI-authored rather than blind human gold. Expanded relevance labels explicitly cover known sources and supporting thoughts plus unrelated controls; the broader candidate pools remain incompletely judged. Another retriever can surface unjudged relevant notes. API calls: 0.

Recall counts grades 1 and 2. MRR@10 uses only queries with a grade-2 note. nDCG@10 uses linear graded gain (0, 1, 2). No-answer queries have no positive denominator and are excluded from quality averages; returned matches are shown separately. Unknown candidates have zero gain provisionally and are counted as unjudged.

| Mode    | Group            | Items | Recall items | MRR items |   R@5 |  R@10 | MRR@10 | nDCG@10 | Unjudged top-10 |
| ------- | ---------------- | ----: | -----------: | --------: | ----: | ----: | -----: | ------: | --------------: |
| words   | all              |   120 |          112 |       111 | 81.4% | 87.0% |  82.2% |   83.6% |             781 |
| words   | kind:lookup      |    52 |           52 |        52 | 83.0% | 87.8% |  85.4% |   85.6% |             382 |
| words   | kind:paraphrase  |    52 |           52 |        52 | 80.8% | 86.5% |  77.6% |   81.3% |             382 |
| words   | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| words   | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| words   | kind:no-answer   |     8 |            0 |         0 |     — |     — |      — |       — |              17 |
| words   | split:dev        |    96 |           88 |        87 | 82.8% | 87.6% |  85.6% |   85.4% |             586 |
| words   | split:test       |    24 |           24 |        24 | 76.4% | 84.7% |  69.8% |   77.2% |             195 |
| bigrams | all              |   120 |          112 |       111 | 81.4% | 87.0% |  82.2% |   83.6% |             781 |
| bigrams | kind:lookup      |    52 |           52 |        52 | 83.0% | 87.8% |  85.4% |   85.6% |             382 |
| bigrams | kind:paraphrase  |    52 |           52 |        52 | 80.8% | 86.5% |  77.6% |   81.3% |             382 |
| bigrams | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| bigrams | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| bigrams | kind:no-answer   |     8 |            0 |         0 |     — |     — |      — |       — |              17 |
| bigrams | split:dev        |    96 |           88 |        87 | 82.8% | 87.6% |  85.6% |   85.4% |             586 |
| bigrams | split:test       |    24 |           24 |        24 | 76.4% | 84.7% |  69.8% |   77.2% |             195 |
| both    | all              |   120 |          112 |       111 | 81.4% | 87.0% |  82.2% |   83.6% |             781 |
| both    | kind:lookup      |    52 |           52 |        52 | 83.0% | 87.8% |  85.4% |   85.6% |             382 |
| both    | kind:paraphrase  |    52 |           52 |        52 | 80.8% | 86.5% |  77.6% |   81.3% |             382 |
| both    | kind:synthesis   |     4 |            4 |         3 | 62.9% | 77.1% | 100.0% |   82.6% |               0 |
| both    | kind:distinction |     4 |            4 |         4 | 87.5% | 91.7% |  87.5% |   89.6% |               0 |
| both    | kind:no-answer   |     8 |            0 |         0 |     — |     — |      — |       — |              17 |
| both    | split:dev        |    96 |           88 |        87 | 82.8% | 87.6% |  85.6% |   85.4% |             586 |
| both    | split:test       |    24 |           24 |        24 | 76.4% | 84.7% |  69.8% |   77.2% |             195 |

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
- **r022** (66.7%): Is LoRA rank a restriction on the stored base matrix or on its learned increment?
  - 02-Zettelkasten/Permanent/A zero initial adapter update preserves the starting function.md
- **r023** (66.7%): What does merging a LoRA adapter change at deployment, and when is keeping it separate useful?
  - 02-Zettelkasten/Permanent/Parameter-efficient training still needs the base model computation.md
- **r027** (66.7%): Does FlashAttention remove quadratic arithmetic when it removes the stored attention matrix?
  - 02-Zettelkasten/Permanent/An acceleration claim needs the resource and baseline to be named.md
- **r029** (50.0%): How can FlashAttention perform extra backward arithmetic and still run faster in the paper?
  - 02-Zettelkasten/Permanent/Recomputation can improve speed when memory traffic is the bottleneck.md
- **r030** (50.0%): Why does recomputing attention blocks trade arithmetic for memory traffic rather than just wasting work?
  - 02-Zettelkasten/Literature/Backward recomputation in FlashAttention.md
- **r038** (66.7%): Can SASRec results with one positive and one hundred sampled negatives be treated as full-catalog ranking scores?
  - 02-Zettelkasten/Permanent/Ranking comparisons require the same candidate protocol.md
- **r041** (66.7%): Why does YouTube retrieval use earlier actions for a future-watch label and limit examples per user?
  - 02-Zettelkasten/Permanent/Prediction context must end before the event being predicted.md
- **r042** (66.7%): What leakage and user-weighting issues arise when predicting a randomly held-out watch from the remaining history?
  - 02-Zettelkasten/Permanent/Prediction context must end before the event being predicted.md
- **r047** (66.7%): What evidence and popularity controls define a Swing item-similarity contribution?
  - 02-Zettelkasten/Permanent/Broad overlap reduces the specificity of a user-pair signal.md
- **r048** (66.7%): How do shared clicked items between a user pair and each user activity affect Swing contributions?
  - 02-Zettelkasten/Permanent/Repeated co-click support is evidence rather than a causal explanation.md
- **r051** (66.7%): Over which token axis does ColBERT MaxSim aggregate its score, and what can be precomputed?
  - 02-Zettelkasten/Permanent/Independent document encoding limits where query-specific interaction can occur.md
- **r063** (66.7%): Why is DeepSeek-R1 training not interchangeable with the R1-Zero or distilled-model pipelines?
  - 02-Zettelkasten/Permanent/Teacher-generated supervision transfers outputs without reproducing the teacher pipeline.md
- **r065** (66.7%): How does GRPO construct an outcome advantage without training a value model?
  - 02-Zettelkasten/Permanent/Group-relative feedback requires meaningful reward variation.md
- **r070** (66.7%): Which negative passages were considered in DPR and how are batch passage embeddings reused?
  - 02-Zettelkasten/Permanent/Hard negatives define the distinctions a retriever learns to make.md
- **r071** (66.7%): How do RAG-Sequence and RAG-Token differ, and which retriever components moved during the reported training?
  - 02-Zettelkasten/Permanent/Latent-document marginalization is more specific than prompt concatenation.md
- **r072** (66.7%): Does joint RAG training in these notes imply rebuilding document embeddings on every update?
  - 02-Zettelkasten/Permanent/Retriever updates and index updates are coupled choices.md
- **r073** (50.0%): What does ReAct reasoning add between actions and observations, and what retrieval interface was evaluated?
  - 02-Zettelkasten/Permanent/An observation should be able to change the next action.md
- **r076** (66.7%): Does placing an LLM inside a fixed sequence make that sequence an autonomous agent?
  - 02-Zettelkasten/Literature/Predefined workflows and model-directed agents.md
- **r086** (0.0%): Why can RRF discard score magnitudes and still aggregate ranked retrieval results?
  - 02-Zettelkasten/Literature/Rank-based combination with reciprocal rank fusion.md
  - 02-Zettelkasten/Permanent/Rank fusion avoids score-scale alignment by discarding score magnitude.md
- **r091** (50.0%): Which transformations create a SimCLR positive pair, and what did its image experiments say about composition?
  - 02-Zettelkasten/Permanent/Augmentation defines which changes the representation is trained to ignore.md
- **r099** (66.7%): How does a second-order factorization machine parameterize interactions in sparse features?
  - 02-Zettelkasten/Permanent/Factor dimension controls both sharing and expressiveness.md
- **r100** (66.7%): Does an FM learn an independent coefficient for every pair or share latent feature factors?
  - 02-Zettelkasten/Permanent/Factor dimension controls both sharing and expressiveness.md
- **r101** (66.7%): How does an FM evaluate pair interactions without enumerating all feature pairs?
  - 02-Zettelkasten/Permanent/Sparse prediction cost follows active features rather than vocabulary size.md
- **r102** (66.7%): What determines sparse FM prediction cost when the vocabulary is much larger than active features?
  - 02-Zettelkasten/Permanent/Fast interaction evaluation does not remove the interaction model.md
- **r104** (50.0%): What role do positional embeddings and per-interest candidate searches play in ComiRec-SA?
  - 02-Zettelkasten/Permanent/Sequence order must enter the representation computation.md
- **r106** (66.7%): How do user-disjoint splits and per-user recall differ from holding out only interactions?
  - 02-Zettelkasten/Literature/Sequence evaluation protocol in ComiRec.md
- **r113** (50.0%): How can two ML systems create a feedback loop without an explicit data dependency?
  - 02-Zettelkasten/Permanent/Observed clicks partly reflect the policy that exposed items.md
- **r114** (50.0%): Distinguish direct training-data selection feedback from interactions mediated through users and the world.
  - 02-Zettelkasten/Permanent/Observed clicks partly reflect the policy that exposed items.md
- **r115** (50.0%): What preferences does BPR infer from implicit interactions, and which comparisons remain unspecified?
  - 02-Zettelkasten/Permanent/An unobserved interaction does not identify a disliked item.md

## No-answer candidates (both)

- **r17**: Which draft lookahead was measured to give the lowest latency in our production service? Top matches: Acceptance cost and lookahead in speculative speedup; Speculative lookahead has a workload-dependent optimum; A better draft model is one that agrees with the target distribution. These do not establish the requested owner fact.
- **r18**: Do these notes record the online CTR uplift from my SASRec deployment? Top matches: A retrieval deployment includes the model and its item index; An aggregate uplift can conceal a transient novelty effect; Literature notes. These do not establish the requested owner fact.
- **r19**: What learning rate did I choose for my own BPR production training run? Top matches: Observed and unobserved item comparisons in BPR; Pairwise logistic likelihood and priors in BPR; A learned interest slot does not supply its own semantic label. These do not establish the requested owner fact.
- **r20**: Which GPU model and cluster size did I use for my GRPO training experiment? Top matches: GPU search throughput must be interpreted with its batch size; Removing the critic shifts GRPO cost toward sampled comparisons; Group-relative advantages in GRPO. These do not establish the requested owner fact.
- **r117**: What batch size and measured latency made speculative lookahead optimal for my service? Top matches: GPU search throughput must be interpreted with its batch size; Acceptance cost and lookahead in speculative speedup; Speculative lookahead has a workload-dependent optimum. These do not establish the requested owner fact.
- **r118**: Which A/B experiment reports my SASRec CTR lift? Top matches: Sampled candidate evaluation in SASRec; Causal next-item supervision in SASRec; Sampled binary next-item training in SASRec. These do not establish the requested owner fact.
- **r119**: What was the exact production learning rate for my BPR model? Top matches: Pairwise logistic likelihood and priors in BPR; Observed and unobserved item comparisons in BPR; Optimizer state is part of an exact training continuation. These do not establish the requested owner fact.
- **r120**: What GPU model and number of machines did my own GRPO experiment actually use? Top matches: Repeated test-set use and model selection; Pairwise interaction parameters in factorization machines; Group-relative advantages in GRPO. These do not establish the requested owner fact.

## Interpretation and next step

English-only tokenization does not test CJK behavior. Broad supporting-label recall can be low even when a sufficient note ranks first, so inspect Recall, MRR and per-item misses together. No performance threshold is imposed on this first baseline; invalid fixtures fail the run, quality changes are reported.

Do not tune on the test scores. Answer quality, independently declared robustness cases, solver comparisons and repetitions are measured separately. Unknown labels are reported explicitly and make these retrieval quality estimates provisional.

Reproduce with `npm run eval`. Machine-readable rankings, configuration hashes and denominators are in `retrieval-baseline.json`. Use EVAL_REPORT_DIR for a new versioned destination; the default is eval/reports/tool-v2. Historical reports, corpus and annotations are preserved.
