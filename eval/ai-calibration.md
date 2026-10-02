# AI-assisted pilot adjudication

The owner delegated the remaining calibration judgments to Codex on October 2, 2026. The six recorded development answers have therefore been adjudicated by an
AI reviewer. No owner labels were inferred from this delegation. Independent
human calibration has not been performed; it is not a prerequisite for continuing
the owner's selected AI-assisted workflow.

The review used the original answers, exact delivered tool results and frozen
correctness references. Existing judge outputs and prior diagnostics were visible
to the reviewer. This is an unblinded development adjudication, not a new agent
trial, an independent human study or a held-out quality result.

## Decisions

- Compound key points are `partial` when some required content is conveyed and
  other content is omitted. In a01 the NF4/BFloat16 distinction is present but
  trainable LoRA adapters are not identified. In a07 continuity testing is mentioned
  but the complete state-preservation requirement is omitted.
- Evaluate reasonable contextual paraphrases by entailment rather than exact
  wording. In a06, allocating request KV blocks as needed supports organizing the
  serving cache as sequences grow. A source saying a benefit occurs **when** spare
  computation is available does not establish **only when**, however.
- A citation can support one constituent of a jointly supported claim. In a06,
  the low-bit storage and double-quantization records are relevant to the named
  components; the optimizer-paging record supplies their co-presentation. Redundant
  relevant evidence is different from an unrelated citation.
- Assess each citation occurrence and its associated predicate. In a08, the later
  correct E8 memory quotation does not cure the earlier HNSW attribution using
  E7/E8: E7 belongs to the Faiss quantization record.
- Preserve explicit citation-bearing attribution when extracting claims. In a07,
  `The bridge is [E33]'s own move: ...` supports the continuity/evidence-selection
  statement. The original judge removed that attribution from its extracted quote
  and then penalized the quote as uncited. The adjudication records the full exact
  answer span and delivered evidence for the correction.
- Separate correctness of a requested absent owner result from the scope of the
  evidence used to establish absence. An exact CTR no-match establishes that lexical
  search result. Bounded or truncated keyword results do not prove that every owner
  measurement is absent anywhere in the corpus. A local absence statement can be
  supported by a complete delivered note.
- Grade extra assertions and link rationales as well as the central answer. The
  corpus-stage and personal-owner claims in a12, and the acceptance/cost and proposed
  measurement-link claims in a11, need separate assessments.

The batching assertion previously presented in chat is **partial**: E2 supports
batching effects on execution costs, but not the added acceptance-rate effect or
the categorical claim that measurements cannot transfer across batch sizes.

## Records and limits

Final AI adjudications are in
`eval/artifacts/2026-10-02T17-49-07-700Z-pilot-owner-review/ai-calibration/`.
They bind the original run and judgment hashes, identify the reviewer as AI, retain
the judge's original labels alongside the adjudicated labels, and record reasons
for both changed rows and additional assertions. The earlier diagnostic audit is
preserved in the sibling `ai-audit/` directory.

The original answers and model judgments remain intact. The six independent owner
sheets remain pending; they are not used as completed human reviews. AI adjudications
are stored as `*-ai-adjudication.json` and are not ingested by `eval:calibrate`, which
continues to compare real human reviews.

This adjudication settles the reviewed cases and defines the development review
rules above. It does not change the runtime judge prompt or demonstrate that the
model judge has learned these rules. A revised grader still needs validation on
fresh development cases. Agreement on the original model-extracted rows excludes
missed assertions and cannot establish complete extraction recall or answer quality.

This review made no new agent or judge API calls. The larger baseline, independent
test set, tool comparisons and robustness evaluation remain separate work.
