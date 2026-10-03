# Bounded real API acceptance — release-smoke-v1

The owner explicitly confirmed DeepSeek fixture data transfer after the initial
automatic approval rejection. Only synthetic fixture questions, note excerpts and
conversation context were sent to **DeepSeek `deepseek-flash`**, through the actual
Obsidian plugin, BM25, macOS / Obsidian 1.13.7. No judge, cloud embedding, other
provider, full evaluation or personal vault was used.

**Eight frozen primary criteria pass after two targeted scenario-5 fixes/reruns.**
This is a basic integration/product smoke, not independent human calibration or a
complete answer-quality evaluation. No public release was performed.

## Requests, tokens and cost

| Item                                       | Actual result                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Actual HTTP requests                       | **33** (27 first run + 3 first scenario-5 rerun + 3 final scenario-5 rerun)                           |
| Complete usage records                     | 31; **2 unknown-use attempts** retain their full reservations                                         |
| Input, cache miss                          | 68,211 tokens                                                                                         |
| Input, cache hit                           | 135,808 tokens (total known prompt input 204,019)                                                     |
| Output including thinking                  | 9,699 tokens                                                                                          |
| Known usage, priced conservatively at peak | **US$0.032916948**                                                                                    |
| Unknown-use reservation                    | **US$0.028472400**                                                                                    |
| Cumulative guard accounting                | **US$0.061389348**, below US$5 / 120 requests                                                         |
| Provider failure                           | One intentional HTTP 400 for `zettel-release-invalid-model`; one deliberate correction/retry succeeds |
| Cancellation                               | One actual dispatched request aborted; no usage returned                                              |
| SDK automatic / network retry              | **0 / 0**; automatic retries disabled                                                                 |
| Additional paid reruns                     | Two, both the unchanged frozen scenario 5 after specific offline repairs                              |

The [official rates](https://api-docs.deepseek.com/quick_start/pricing/) were checked
again before dispatch: per million input miss/hit/output tokens, peak $0.30/$0.006/
$1.20; off-peak half those rates. Known requests occurred on Saturday UTC, so their
rate-table estimate at off-peak is $0.016458474. **No account billing receipt was
queried.** Exact final charges are not asserted: cancellation/error usage is
unknown and remains reserved at worst-case peak. The guard retains the higher
$0.061389348 accounting for the entire run.

Each turn allows <=10 HTTP attempts, <=65,536 encoded request bytes and <=8192
output tokens. Targeted reruns seed the guard with all earlier attempts, including
unknown reservations, so they do not reset the total allowance.

## Frozen scenario decisions

| #                      | Decision                                      | Evidence / scope                                                                                                                                                      |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Single note          | **Pass**                                      | Genuine search/read; stored four-bit NF4 versus BFloat16 computation; delivered sources cited; 3 requests                                                             |
| 2 Multi-note synthesis | **Pass primary criterion**                    | Both mechanisms read; training optimizer states distinguished from inference KV cache; principal facts cited; 3 requests; ancillary wording finding below             |
| 3 Follow-up            | **Pass**                                      | Continues scenario 2 context, identifies PagedAttention as inference mechanism; current/prior source IDs preserved; 2 requests                                        |
| 4 Chinese/paraphrase   | **Pass**                                      | Chinese answer, English search reformulation in actual BM25; correct storage/computation distinction; 2 requests                                                      |
| 5 Missing evidence     | **Pass final; two earlier failures retained** | Final answer starts with a searched-notes limitation, discloses an output-budget failure and no complete note census; no invented owner CTR delta; 7 + 3 + 3 requests |
| 6 Cancel/recover       | **Pass**                                      | First actual dispatch stopped; UI ends aborted, no committed old answer; next question answers; 1 + 2 requests                                                        |
| 7 Error/retry          | **Pass**                                      | Actual invalid-model 400 with actionable error; restored Flash completes; 1 + 3 requests                                                                              |
| 8 Optional self-review | **Pass protocol**                             | Two research requests + one review request; parsed JSON, support quotes, final audit; zero repair; no claim of improved quality                                       |

The [direct source inspection](release-source-review.md) records main claim/path/
scope checks performed by Codex, and a checklist for owner review. It is not an
independent human grade. Not every ancillary sentence is certified.

## Original failures and corrections

1. First scenario 5 reached 64,012 estimated input bytes against the 64,000-byte
   allowance after seven requests. No final insufficiency answer could be sent.
   The loop now reserves 4096 bytes and ends research on an output-budget rejection;
   paired results and raw transcripts remain intact. Two meaningful regressions
   pass. [ADR-0028](adr/0028-reserve-final-synthesis-context.md).
2. First targeted rerun produced a response, but its opening/headings claimed
   corpus-wide absence before acknowledging a partial/failed search. This is a
   **semantic failure despite the E2E process passing**. The final control message
   now requires scoped absence in opening/headings and disclosure of failed queries.
   The second targeted rerun passes that criterion; input and standard unchanged.
3. First test-process failure also reported unequal saved history because JSON
   property insertion order changed during schema parsing. Direct deep comparison
   proved the transcript equal. The harness comparison was corrected; persisted
   history, restored final answer and citation click pass in free UI verification.
4. One approval-review attempt for the targeted command timed out before process
   creation. Its permitted retry launched once; the timeout incurred no model
   request. This is separate from model retry accounting.

## Retained artifacts and strict replay

- First run: `artifacts/release-prep/live-2026-10-03T06-25-23-565Z/`.
- Failed semantic rerun: `artifacts/release-prep/live-2026-10-03T07-03-27-135Z/`.
- Final scenario 5: `artifacts/release-prep/live-2026-10-03T07-27-17-693Z/`.
- First run log: `e2e-live-v2.log`; targeted logs:
  `e2e-live-scenario5-r2.log`, `e2e-live-scenario5-r3.log` in `artifacts/release-prep/`.
- Original SDK/loop/tool replay reproduced all eight original outputs, including the
  failed answer, with zero network. After the loop repair, seven unaffected
  positives strictly replayed with exact answers, saved history and citation opens;
  final scenario 5 strictly replays too. New package replay evidence is in readiness.

These are fresh per-run v2-format captured HTTP exchanges, without auth headers;
old cassettes, labels and reports are untouched. Final artifacts retain tool result
contracts, source revisions, raw reasoning and self-review protocol.

## Quality findings kept visible

Scenario 2's extra table sentence that optimizer tensors “live and die with the
optimizer update” is not established by the supplied note; optimizer state can
persist across updates. The primary training-versus-serving distinction passes,
but this ancillary statement needs correction rather than endorsement. Scenario 5
includes a nonstandard plain-text `[E21-absence is scoped to this exact pattern]`
annotation. It is not a supported citation grammar or an absence-evidence ID and
must not be presented as one; actual CTR absence is supported by the exact zero-hit
match contract. These are quality/protocol findings for the retained samples, not
proof of uniform answer correctness. Answers are also longer than requested.

No fabricated CTR measurement or unknown clickable citation ID was observed in the
final primary checks. Structural citation validity does not prove entailment.
Fresh final quality evaluation, independent human calibration and broader
provider/platform testing remain P1. No defaults were changed to enable hybrid or
self-review based on this smoke.
