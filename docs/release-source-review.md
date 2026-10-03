# Release smoke source inspection and owner checklist

Inspection performed by Codex against the frozen fixture and actual delivered
contracts. No external judge or independent human calibration was used. The
primary criteria are frozen in [release-live-protocol](release-live-protocol.md).
Full answers, requests and source exposures remain in the run directories listed
in [API results](release-api-results.md), including both failed scenario-5 attempts.

| Scenario | Direct check                                                                                                                                                                                                                | Result / limit                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `Literature/Storage and computation precision in QLoRA.md` and `Permanent/Four-bit weight storage does not mean four-bit arithmetic everywhere.md`: NF4 storage/BFloat16 computation, not universal four-bit arithmetic     | Main statement supported; genuine read and delivered body contracts; known IDs                                                                                                                                          |
| 2        | `Literature/Paged optimizer states for training memory spikes.md`: unified memory/CPU movement during training; `Literature/PagedAttention and logical KV-cache blocks.md`: logical-to-physical blocks for serving KV cache | Both read, principal distinctions supported; extra optimizer-state lifetime sentence unsupported and flagged                                                                                                            |
| 3        | Same two mechanisms plus `Permanent/Paged optimizer states and paged KV caches solve different lifecycles.md`                                                                                                               | Correct inference mechanism and prior/current ledger identity; explanation cites actual exposures                                                                                                                       |
| 4        | Same QLoRA literature/permanent precision notes                                                                                                                                                                             | Chinese answer preserves distinction; tool query reformulates in English; BM25 confirmed                                                                                                                                |
| 5        | Final exact `CTR` match: 0 results, exact accessible-corpus contract, no truncation; SASRec matches and `Literature/Sampled candidate evaluation in SASRec.md`: offline HR@10/NDCG@10                                       | No owner online CTR measurement invented. Opening scoped to searched notes, failed broad query disclosed, no claim every note was read. Nonstandard absence annotation remains a formatting finding, not valid evidence |
| 6        | Actual HTTP dispatch preceded stop; cancelled item aborted and no committed answer; recovery asks storage precision                                                                                                         | Recovery succeeds and strict replay identical; unknown cancelled usage reserved                                                                                                                                         |
| 7        | HTTP 400 for intentionally invalid model, then Flash restored                                                                                                                                                               | One deliberate correction/retry; final sources/citations supported; no hidden retry                                                                                                                                     |
| 8        | Saved `reliability.status=self-reviewed`, one parsed JSON attempt, literal support quotes from QLoRA delivery, zero repairs                                                                                                 | Protocol passes; same-model agreement does not establish independent correctness                                                                                                                                        |

All source paths above are under `fixtures/vault/02-Zettelkasten/`. Actual source
hashes and complete delivered excerpts are stored in scenario JSON; no note was
modified to satisfy a criterion. Ordinary links and citations open existing files;
UI/history checks reused answers without additional paid questions.

Owner review checklist (not yet signed off independently):

- [ ] Read the eight final primary outputs and delivered source passages.
- [ ] Review the ancillary lifecycle wording in scenario 2 and malformed absence
      annotation in scenario 5; treat neither as a certified claim/citation.
- [ ] Confirm the failures retained in both earlier scenario-5 runs.
- [ ] Check scoped absence and distinguish source evidence from general advice.
- [ ] Confirm the review audit demonstrates protocol behavior, not quality gain.

This checklist supports independent review; it is not a completed human grade or a
new mandatory P0 gate beyond the requested frozen basic acceptance.
