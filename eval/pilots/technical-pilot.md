# Technical evaluation pilot review

Corpus: `learning-v1-790b1b2bb6c7`. Review: **author-reviewed; owner-review-pending**. All 32 items are synthetic development items. No model answers have been generated.

Review the question intent, the semantic relevance grades and whether every required point is supported by its cited record. A correction to a label should repair the annotation, not change the learning note to make the question pass. Structural validation and author review do not substitute for owner review.

## Retrieval questions

| ID  | Kind        | Question                                                                                                                  | Positive records                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| r01 | lookup      | Does four-bit QLoRA weight storage imply four-bit matrix computation?                                                     | Storage and computation precision in QLoRA (2); Four-bit weight storage does not mean four-bit arithmetic everywhere (2)                                                                                                                                                                                                                                                                              |
| r02 | lookup      | Why does a user pair with a broad shared click history contribute less to Swing item similarity?                          | User-pair evidence in Swing similarity (2); Broad overlap reduces the specificity of a user-pair signal (2)                                                                                                                                                                                                                                                                                           |
| r03 | lookup      | In ColBERT MaxSim, are maxima summed over query tokens or document tokens?                                                | Contextual token matching with ColBERT MaxSim (2); MaxSim scoring is asymmetric between query and document (2)                                                                                                                                                                                                                                                                                        |
| r04 | lookup      | Which probability must LogQ estimate for interaction-sampled minibatch negatives?                                         | In-batch negatives and sampling correction in neural retrieval (2); Streaming estimation of item sampling probabilities (1); Sampling correction must describe the actual negative sampler (2); Streaming frequency estimates can drift through hash collisions (1)                                                                                                                                   |
| r05 | paraphrase  | If an attention implementation is mathematically exact, must it produce bit-for-bit identical floating-point results?     | Blockwise softmax accumulation in FlashAttention (1); Exact attention equivalence does not require identical floating-point execution (2)                                                                                                                                                                                                                                                             |
| r06 | paraphrase  | Should standardization statistics be fitted once on all examples before running cross-validation?                         | Predictor scaling before ridge regression (1); Rotating held-out folds in cross-validation (1); Preprocessing must respect the held-out fold boundary (2)                                                                                                                                                                                                                                             |
| r07 | paraphrase  | Can a perfect second-stage ranker recover a relevant item omitted by the first-stage retriever?                           | Candidate generation and ranking at YouTube (1); ANN approximation adds a separate source of retrieval loss (1); Candidate aggregation is a separate serving decision (1); Candidate coverage limits what a ranker can recover (2); Candidate filtering can exclude a document with a competitive aggregate score (1); Passage preparation defines what the retriever can return (1)                  |
| r08 | paraphrase  | Does drawing the same observation repeatedly in a bootstrap sample create new independent evidence?                       | Bootstrap resampling for estimator variability (1); Bootstrap duplicates represent resampling rather than additional evidence (2); Two views of one example do not provide two independent observations (1)                                                                                                                                                                                           |
| r09 | synthesis   | How can compaction and external task notes preserve progress without guaranteeing that needed details will be used later? | Compaction for long-running agent tasks (1); Structured notes outside the agent context window (1); Compaction is a lossy state transition that needs continuity checks (1); Persistent memory requires a retrieval decision as well as storage (1)                                                                                                                                                   |
| r10 | synthesis   | Does exporting preprocessing with a TFX model establish complete training-serving parity?                                 | Exported feature transformations in TFX (1); Simple models and independent infrastructure tests (1); Training-serving skew comparisons in Rules of ML (1); Exporting preprocessing reduces one source of skew without proving full parity (2); Identical-example score checks isolate an engineering boundary (1); Training-serving skew has several distinct causes (1)                              |
| r11 | synthesis   | Why must marking a Flink input idle be considered together with the late-event policy?                                    | Allowed lateness and repeated window firing in Flink (1); Input watermark minima and idle sources in Flink (1); A watermark is a progress assertion rather than proof that no late data exists (1); Ignoring an idle input trades a blocking risk for a lateness assumption (2); Late window updates require consumers to recognize revisions (1)                                                     |
| r12 | synthesis   | Does probing more IVF lists also eliminate the distance approximation introduced by product quantization?                 | Inverted-file pruning in Faiss similarity search (1); Product quantization and asymmetric distance computation (1); Increasing IVF search breadth addresses pruning rather than quantization (2)                                                                                                                                                                                                      |
| r13 | distinction | Is DPO reference-free just because it does not train a separate reward network?                                           | Pairwise updates and offline data in DPO (1); Reference-relative preference optimization in DPO (2); DPO removes an explicit reward model while retaining a preference model (1); The DPO reference defines relative change rather than absolute preference (2)                                                                                                                                       |
| r14 | distinction | Can increasing HNSW query search breadth substitute for the graph connections selected during construction?               | HNSW construction parameters and neighbor selection (2); Hierarchical search and insertion in HNSW (1); HNSW query tuning cannot replace construction quality (2)                                                                                                                                                                                                                                     |
| r15 | distinction | Is an answer grounded merely because it is factually correct and contains citation markers?                               | Answer correctness and citation coverage in ALCE (2); Irrelevant citations and joint passage support in ALCE (1); Citation presence is weaker than citation support (2); Joint support requires evaluating the cited set rather than isolated passages (1); Retrieval coverage and evidence use need separate measurements (1); Strong token matches do not establish a coherent supporting claim (1) |
| r16 | distinction | Do QLoRA paged optimizers and vLLM PagedAttention manage the same tensors and workload?                                   | Paged optimizer states for training memory spikes (1); PagedAttention and logical KV-cache blocks (1); Paged optimizer states and paged KV caches solve different lifecycles (2)                                                                                                                                                                                                                      |
| r17 | no-answer   | Which draft lookahead was measured to give the lowest latency in our production service?                                  | None: requested owner fact absent                                                                                                                                                                                                                                                                                                                                                                     |
| r18 | no-answer   | Do these notes record the online CTR uplift from my SASRec deployment?                                                    | None: requested owner fact absent                                                                                                                                                                                                                                                                                                                                                                     |
| r19 | no-answer   | What learning rate did I choose for my own BPR production training run?                                                   | None: requested owner fact absent                                                                                                                                                                                                                                                                                                                                                                     |
| r20 | no-answer   | Which GPU model and cluster size did I use for my GRPO training experiment?                                               | None: requested owner fact absent                                                                                                                                                                                                                                                                                                                                                                     |

Grades: 2 = independently sufficient, 1 = a needed supporting part, 0 = reviewed negative. All top-twenty candidates from the three current tokenizer modes were pooled; positive records missed by that pool were added separately. Full negative rationales and excerpts are in [retrieval.json](../retrieval.json). Unlisted notes remain unjudged.

## Answer rubrics

Each support set below is an alternative sufficient set. Records joined by **AND** are jointly required; sets joined by **OR** are alternatives. These labels are annotation IDs, not runtime evidence IDs. Exact excerpts, inference/source distinctions, setup questions and graph checks are in [answers.json](../answers.json).

### a01: lookup (answerable)

Does using four-bit base weights mean all QLoRA matrix operations run in four-bit arithmetic?

- No. Low-bit base-weight storage and higher-precision computation are different components. Support: (storage) OR (precision).
- The literature note describes NF4 storage and BFloat16 computation, with trainable LoRA adapters. Support: (storage).

Evidence records:

- `storage`: Storage and computation precision in QLoRA (literature-paraphrase).
- `precision`: Four-bit weight storage does not mean four-bit arithmetic everywhere (permanent-inference).

Forbidden conclusions:

- Claims that every tensor or matrix operation uses four bits.
- Describes NF4 as universally optimal for arbitrary tensor distributions.

Either record supports the main distinction; exact numerical formats require the literature evidence.

### a02: lookup (answerable)

Why is an arbitrary item-popularity statistic insufficient for choosing the LogQ correction?

- The correction must describe the distribution that actually generated alternatives in the batch loss. Support: (loss) OR (sampler).
- For interaction-sampled batches the literature note subtracts log estimated batch sampling probability from training logits. Support: (loss).

Evidence records:

- `loss`: In-batch negatives and sampling correction in neural retrieval (literature-paraphrase).
- `sampler`: Sampling correction must describe the actual negative sampler (permanent-inference).

Forbidden conclusions:

- Invents a required serving-score correction absent from these notes.
- Says any global popularity estimate is interchangeable with batch sampling probability.

Keep the supported training-loss statement separate from an unsupported serving prescription.

### a03: lookup (answerable)

How can FlashAttention be exact without guaranteeing bitwise identical outputs to a full-matrix implementation?

- The tiled method accumulates the same mathematical attention expression without storing the full attention matrix. Support: (algorithm).
- Different reduction order and intermediate rounding need not preserve bitwise identity; the permanent note recommends numerical tolerances. Support: (qualification).

Evidence records:

- `algorithm`: Blockwise softmax accumulation in FlashAttention (literature-paraphrase).
- `qualification`: Exact attention equivalence does not require identical floating-point execution (permanent-inference).

Forbidden conclusions:

- Calls FlashAttention an approximation that drops attention interactions.
- Attributes the permanent note numerical qualification as a quoted claim from the literature note.

The mathematical result is literature evidence; the verification qualification is explicitly permanent-note reasoning.

### a04: synthesis (answerable)

If preprocessing is exported with the TFX model, what training-serving discrepancies can still require investigation?

- Shared exported transformations address inconsistent transformation logic, not every part of the prediction path. Support: (export) OR (limits).
- Upstream inputs, timestamps, defaults, runtime behavior or temporal distribution change can remain relevant. Support: (limits) OR (skew).
- Compare a fixed model on the same example across training and serving to isolate engineering mismatch; parity does not prove live-distribution similarity. Support: (check) OR (skew AND limits).

Evidence records:

- `export`: Exported feature transformations in TFX (literature-paraphrase).
- `skew`: Training-serving skew comparisons in Rules of ML (literature-paraphrase).
- `limits`: Exporting preprocessing reduces one source of skew without proving full parity (permanent-inference).
- `check`: Identical-example score checks isolate an engineering boundary (permanent-inference).

Forbidden conclusions:

- Claims exporting transformations proves complete parity.
- Treats every offline-to-online gap as a feature-computation bug.

The diagnostic point requires the check note, or the combination of skew comparisons and the parity-limits synthesis.

### a05: synthesis (answerable)

Why does fixing a blocked Flink watermark by marking a source idle also require a late-data policy?

- An operator advances with the minimum input watermark; an idle input can otherwise hold it back. Support: (minimum).
- Ignoring the idle input can let downstream event time advance before that input resumes with old timestamps. Support: (tradeoff).
- Watermarks do not physically prevent late arrivals; retained state and allowed lateness determine acceptance, refiring or default dropping after expiry. Support: (late AND progress) OR (late AND tradeoff).

Evidence records:

- `minimum`: Input watermark minima and idle sources in Flink (literature-paraphrase).
- `late`: Allowed lateness and repeated window firing in Flink (literature-paraphrase).
- `tradeoff`: Ignoring an idle input trades a blocking risk for a lateness assumption (permanent-inference).
- `progress`: A watermark is a progress assertion rather than proof that no late data exists (permanent-inference).

Forbidden conclusions:

- Claims marking an input idle guarantees no later old events.
- Says all late events are accepted indefinitely.

Both the mechanism and its consequence are required, without assuming an owner Flink configuration.

### a06: synthesis (answerable)

How do QLoRA paged optimizers differ from vLLM PagedAttention, despite the shared memory-management terminology?

- QLoRA paging addresses optimizer-state pressure during training; the literature record describes CPU/GPU state movement. Support: (optimizer).
- PagedAttention allocates logical and physical KV-cache blocks for requests during serving. Support: (cache).
- The mechanisms manage different tensors and lifecycles and should not be treated as interchangeable. Support: (comparison) OR (optimizer AND cache).

Evidence records:

- `optimizer`: Paged optimizer states for training memory spikes (literature-paraphrase).
- `cache`: PagedAttention and logical KV-cache blocks (literature-paraphrase).
- `comparison`: Paged optimizer states and paged KV caches solve different lifecycles (permanent-inference).

Forbidden conclusions:

- Equates optimizer-state paging with KV-cache paging.
- Says PagedAttention eliminates every unused cache slot.

Comparison can be supported by a standalone synthesis or the two jointly required literature records.

### a07: follow-up (answerable)

After a context reset, why is merely having stored task notes insufficient to ensure the next decision uses the right information?

Setup question to run first: How do compaction and structured task notes differ in the way they preserve information across long tasks?

- Saved records must be selected and reintroduced when relevant; storage alone does not ensure use. Support: (retrieval).
- Preserve and recover decisions, unresolved issues and necessary evidence; evaluate continuity rather than compression ratio alone. Support: (loss).

Evidence records:

- `persistence`: Structured notes outside the agent context window (literature-paraphrase).
- `retrieval`: Persistent memory requires a retrieval decision as well as storage (permanent-inference).
- `loss`: Compaction is a lossy state transition that needs continuity checks (permanent-inference).

Forbidden conclusions:

- Claims every saved record is automatically available in the next model context.
- Claims compaction guarantees lossless preservation.

At live evaluation time run the history question first, then this follow-up in the same conversation; reset between independent trials.

### a08: provenance (answerable)

Which literature notes support the open permanent note, and how do they support its distinction between construction and query tuning?

Open note: HNSW query tuning cannot replace construction quality

- Its source metadata links to the construction-parameters record and the hierarchical-search record. Support: (source_construction AND source_hierarchy).
- efConstruction and neighbor selection determine connections available in the graph. Support: (construction).
- Query breadth explores the existing graph, so it cannot be described as the same control as creating edges. Support: (thought) OR (construction AND hierarchy).

Evidence records:

- `source_construction`: HNSW query tuning cannot replace construction quality (metadata).
- `source_hierarchy`: HNSW query tuning cannot replace construction quality (metadata).
- `construction`: HNSW construction parameters and neighbor selection (literature-paraphrase).
- `hierarchy`: Hierarchical search and insertion in HNSW (literature-paraphrase).
- `thought`: HNSW query tuning cannot replace construction quality (permanent-inference).

Forbidden conclusions:

- Lists IVF or quantization notes as this permanent note direct literature sources.
- Invents a missing direct source link.

Read source metadata as provenance, then literature bodies as claim evidence. No particular tool order is prescribed.

### a09: link-suggestion (answerable)

Would a direct link between the open note and "Citation presence is weaker than citation support" help? Explain the relationship and keep it a suggestion.

Open note: Strong token matches do not establish a coherent supporting claim

- Local token similarities help choose passages but do not establish a coherent supporting proposition. Support: (matches).
- Citation markers, factual truth and actual passage support are distinct. Support: (citations).
- A defensible link connects evidence selection to claim verification; explain that relationship as a proposed synthesis. Support: (matches AND citations).

Evidence records:

- `matches`: Strong token matches do not establish a coherent supporting claim (permanent-inference).
- `citations`: Citation presence is weaker than citation support (permanent-inference).

Forbidden conclusions:

- Claims to have created or modified a link.
- Treats the proposed connection as an already stated claim of the original paper.

These permanent notes have no existing direct link in either direction. A justified proposal or a reasoned decision against adding a redundant link is acceptable.

### a10: follow-up (answerable)

If the answer is factually correct and has valid citation IDs, what still needs checking?

Setup question to run first: What do these notes say about evaluating answer correctness separately from citations?

- Check whether the attached passages actually support each claim; ID validity and factual truth are insufficient. Support: (presence) OR (alce).
- For multiple citations assess their joint support and whether individual references are irrelevant or unnecessary. Support: (joint) OR (set).

Evidence records:

- `presence`: Citation presence is weaker than citation support (permanent-inference).
- `alce`: Answer correctness and citation coverage in ALCE (literature-paraphrase).
- `joint`: Irrelevant citations and joint passage support in ALCE (literature-paraphrase).
- `set`: Joint support requires evaluating the cited set rather than isolated passages (permanent-inference).

Forbidden conclusions:

- Treats ledger membership as an entailment judgment.
- Requires each passage alone to support a claim that legitimately needs a jointly supporting set.

Run the setup question before the follow-up; this tests evidence use rather than merely citation syntax.

### a11: partial (partial)

What draft lookahead should I deploy for lowest latency, and do these notes contain measurements from my service that determine it?

- Lookahead trades draft work against expected accepted tokens; acceptance, draft cost and target execution conditions affect latency. Support: (model) OR (optimum).
- The frozen notes do not record an owner service latency experiment, so no measured deployment optimum can be stated. Support: corpus-level absence annotation; no positive evidence asserted.

Evidence records:

- `model`: Acceptance cost and lookahead in speculative speedup (literature-paraphrase).
- `optimum`: Speculative lookahead has a workload-dependent optimum (permanent-inference).

Forbidden conclusions:

- Invents a numeric lookahead or owner latency result.
- Presents a paper speedup as an owner production measurement.
- Refuses to explain the supported tradeoff merely because the owner measurement is absent.

A useful answer explains the documented tradeoff and clearly separates it from the missing service measurement. No evidence group is attached to the absence claim; it is a corpus-level annotation.

### a12: no-answer (no-answer)

Do these notes contain a measured online CTR improvement from my SASRec deployment?

- No such owner deployment result is recorded in the frozen corpus; do not infer whether a deployment actually occurred. Support: corpus-level absence annotation; no positive evidence asserted.
- Paper-level sampled ranking metrics cannot be substituted for an owner online CTR measurement. Support: corpus-level absence annotation; no positive evidence asserted.

Evidence records:

- No positive evidence for the requested owner result. Related context can be cited with its narrower scope made explicit.

Forbidden conclusions:

- Invents an uplift percentage or a claim that the owner ran an experiment.
- Uses paper Hit Rate or NDCG as proof of owner CTR improvement.

No positive citation is required for the absence statement. Citing a protocol note to explain its narrower scope is allowed if it is not represented as owner-result evidence.

## Review priorities

1. Confirm that grade-2 records answer the question independently; do not award full relevance merely for shared vocabulary.
2. Check supporting-label breadth: the recall denominator should reflect useful evidence rather than every neighbouring note.
3. Keep permanent-note inferences distinct from source-author claims, especially floating-point qualifications and deployment diagnoses.
4. Check alternative and joint support sets. Do not enforce one exact citation path when another is sufficient.
5. Confirm no-answer and partial questions ask for facts genuinely absent from the corpus, and do not imply that the owner performed the hypothetical deployment.
6. Add actual learning/interview questions when available. Freeze separate test families before tuning; the current pilot is entirely dev.

The offline [baseline](../reports/retrieval-baseline.md) reports misses but does not identify an automatic remedy. It is appropriate to inspect link expansion or reformulation later, after validating the affected labels. Live agent answers and a calibrated judge remain a separate, paid phase.
