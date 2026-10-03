# Frozen basic live API protocol — release-smoke-v1

Frozen before first dispatch, 2026-10-02. One provider: **DeepSeek**, API model
**deepseek-flash**, Chat Completions at `https://api.deepseek.com`. New installs
select this combination; existing choices are preserved. BM25 + structural checks
remain defaults. Optional self-review is tested only in scenario 8.

[Official model/prices](https://api-docs.deepseek.com/quick_start/pricing/)
confirm the model ID and peak per-million-token rates: input miss $0.30, input hit
$0.006, output $1.20. Accounting always uses peak prices; actual off-peak charges
may be lower. [Thinking/tool protocol](https://api-docs.deepseek.com/guides/thinking_mode/)
requires replaying reasoning content whenever tools are present.

## Limits and cost preflight

HTTP attempts <=120; total accounted allowance <=$5; <=10 attempts per scenario
turn; <=65,536 encoded request bytes; <=8192 output tokens per request. SDK automatic
retries are disabled. No retry loop is enabled; recoverable transport failures may
be retried once only if explicitly recorded. Unknown, failed and cancelled usage
keeps a worst-case reservation. Maximum reservation is $0.03072 per request
(69,632 input tokens including framing, 8192 output); 120 such attempts <=$3.6864.
Typical eight scenarios should need around 25–45 requests (<$1.40 even if each
were at its maximum); this is an estimate, not a charge receipt.

The guard runs before actual fetch, counts failures and uses complete SSE usage
including cache hits when available. Headers/keys never enter reports. No cloud
embeddings, judge, comparison or full 66-job evaluation runs. Existing fixture
configuration supplies the key; absence blocks only this phase.

## Inputs and fixed pass criteria

Answers may be concise; scenario inputs below are not changed after viewing results.
All expected paths are in `02-Zettelkasten/` in the frozen 318-note fixture.

| #   | Frozen input / action                                                                                                                                                                                               | Pass criterion                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | In my notes, what does four-bit weight storage in QLoRA imply about computation precision? Answer briefly with citations.                                                                                           | Genuine search/read; cites actually delivered QLoRA evidence; no claim that all arithmetic is four-bit                                                                     |
| 2   | Compare QLoRA paged optimizers with vLLM PagedAttention using my notes. Keep the comparison concise and cite each mechanism.                                                                                        | Reads evidence for both; distinguishes training optimizer states from inference KV-cache; both main facts cited                                                            |
| 3   | Which of those mechanisms is used during inference, and why? Cite the supporting note.                                                                                                                              | Continues scenario 2 transcript; correct distinction; prior/current evidence identities respected                                                                          |
| 4   | 我的笔记中，QLoRA 的四位权重存储是否意味着矩阵计算也是四位？请简短回答并引用。                                                                                                                                      | Chinese retrieval/answer works with BM25 (English search reformulation allowed); real citations; correct precision distinction                                             |
| 5   | Do my notes contain a measured online CTR improvement from my own SASRec deployment? If not, say what is missing; do not estimate it.                                                                               | Discloses missing owner measurement; no fabricated CTR number or evidence                                                                                                  |
| 6   | Start: Explain how my notes distinguish QLoRA and PagedAttention with citations. Stop after the first actual HTTP dispatch. Then ask: What is QLoRA storage precision? Answer briefly from my notes with citations. | Actual request cancelled; stopped UI/tool entries; following turn succeeds; no old answer contamination                                                                    |
| 7   | Once select `zettel-release-invalid-model`, ask: What is QLoRA storage precision? Answer briefly from my notes with citations. Restore model and ask the same input.                                                | Real provider rejection (one HTTP attempt); clear error; correct retry completes once                                                                                      |
| 8   | Enable self-review. Ask: What is QLoRA storage precision? Answer in one short cited sentence using my notes.                                                                                                        | Real review JSON protocol parses, final answer/audit recorded; one repair maximum; extra calls counted. Any failed/malformed review is retained and blocks a success claim |

Citations, Copy/Insert and history restore attach to existing scenario answers,
without another paid question. New HTTP recordings, answers, evidence and failed
attempts go to a fresh run directory. Strict replay must consume the same requests
with zero network. Factual review is direct source inspection plus an owner review
checklist, without an external judge; it is not independent human calibration.
