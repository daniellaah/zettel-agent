# First public-test release readiness

Owner request: 2026-10-02; source commit/push authorized on 2026-10-03; live acceptance completed after explicit confirmation
on 2026-10-03. **Local 0.1.0 installation snapshot; not tagged, released or submitted to the
community directory.** Existing changes were
retained. No subagent was used. BM25 and structural checks remain defaults;
new installations select DeepSeek Flash.

**Decision: ready for a scoped first public test. All required P0 gates pass
within the disclosed scope.** Scope is **macOS / Obsidian 1.13.7 / DeepSeek
`deepseek-flash` / BM25**. Eight frozen basic criteria pass; this is not a complete
quality evaluation, independent human calibration or a production guarantee.
Minimum-version and other-platform installation remain explicitly unverified.

## Ordered P0 gates and evidence

| Gate                           | Priority | Status                       | Evidence / limit                                                                                                                                                      |
| ------------------------------ | -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 read-only navigation      | blocker  | Free pass                    | Exact existing-file opens, deleted/renamed/duplicate/stale citations, unresolved/app-command links, fixture hash audit                                                |
| P0-2 lifecycle/recovery        | blocker  | Free pass                    | Abort before initialization, owned events/finally/ledger, stop/reset/load/close/unload isolation, actionable notices                                                  |
| P0-3 history/recordings/replay | blocker  | Free pass                    | Schema/tool-pair validation, bad-file isolation, pending/backup recovery, serialized snapshots/tombstones, strict request/corpus/mode replay, no network fallback     |
| P0-4 setup/compatibility       | blocker  | Pass in disclosed scope      | Missing key and research folder, settings/BM25, actual local hybrid/warm cache/fallback, official model catalog, macOS 1.13.7                                         |
| P0-5 bounded live API smoke    | blocker  | Pass primary frozen criteria | Eight outcomes, 33 cumulative HTTP attempts, retained original failures and targeted fixes, source inspection, strict zero-network replay; quality findings disclosed |
| P0-6 build/CI/local package    | blocker  | Pass in disclosed scope      | Locked offline clean install/check/build, safe reproducible build, free CI configured, exact three-asset local package                                                |
| P0-7 README                    | blocker  | Complete / facts aligned     | Manual installation, setup, tool/privacy/storage/cost/recovery descriptions, actual live fixture screenshot, no fake Release link                                     |
| P0-8 project presentation      | blocker  | Complete / facts aligned     | Merged into README per owner request; screenshot/Mermaid, attribution, validation distinctions and roadmap                                                            |

## Actual validation in this preparation

| Type                          | Result                                                                                                                                                            | Evidence in `artifacts/release-prep/`                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit/offline/engineering      | **363 tests / 63 files pass**, TypeScript/ESLint/Prettier pass                                                                                                    | `check-live-final.log`; includes two final-context regressions                                                                   |
| Clean locked verification     | Node 24.9.0, `npm ci --offline --ignore-scripts`, check, production build and verification                                                                        | `check-clean-live-final.log`, `clean-live-final.json`                                                                            |
| Prior complete free source UI | **10 checks / 5 files pass**, macOS / Obsidian 1.13.7                                                                                                             | `e2e-final-free.log`; followed by bounded live and current-code strict replay                                                    |
| Prior installed package UI    | **9 checks / 4 files pass** before final-context fix                                                                                                              | `e2e-package-install.log`; superseded by the final package check below                                                           |
| Current live acceptance       | **8 frozen primary criteria pass** after two affected-only reruns                                                                                                 | Three `live-*` directories; [API results](release-api-results.md)                                                                |
| Current strict live replay    | Seven unaffected positives pass in the repaired loop; final scenario 5 also identical; history restored and citations open, **0 network**                         | `e2e-live-offline-v1.log`, final scenario-5 `checks.json`; final installed package replays all eight primary outputs identically |
| Local Ollama                  | Existing Qwen model; first partition build encoded 318 sections, warm build reused 318/318 with zero encoding; hybrid query and unavailable-service BM25 fallback | `local-cache-ui.json`; no model/runtime download or cloud embedding charge                                                       |
| Reproducible/safe build       | Clean/repeat/package bundle hashes checked; inherited plugin destination not created                                                                              | `build-reproducibility-live-final.json`, `package-verification-live-final.json`                                                  |
| Frozen artifact integrity     | **382 original files unchanged**                                                                                                                                  | `protected-hashes.json`, final `protected-audit.json`                                                                            |

**Final installed package: 10 checks / 5 files pass** in
`e2e-package-live-final.log`, with source rebuilding disabled. One of those checks
strictly replays all eight primary outputs (seven original positives + final
scenario 5), restores persisted history and opens citations with zero network.
Exact installed file hashes match the ZIP and clean/repeated build.

No default full live E2E, 66-job Agent/judge experiment, provider comparison, cloud
embedding or owner-vault test ran. Hosted GitHub Actions has not been dispatched;
its free steps ran locally. Only test-owned temporary fixture notes and explicit
user Copy/Insert were written. Existing corpus and old recordings remain intact.

## Real API accounting and sample limits

**33 requests**; known cache-miss input 68,211, cache-hit input 135,808 and output
including thinking 9,699 tokens. At verified peak prices, known use is
**$0.032916948**, plus **$0.028472400** retained for cancellation/intentional error:
**$0.061389348 conservative total**, below $5 / 120. Exact billed cost is unknown;
no account receipt was queried. SDK/network automatic retries: zero. There was one
intentional invalid-model HTTP 400 and one cancelled dispatch; one corrected retry
succeeded. Scenario 5 had two targeted reruns, each after a specific offline fix.

First scenario 5 failed because input space ran out before synthesis. The loop now
reserves 4096 bytes and stops expanding after an output-budget error. Its first
rerun answered but overstated absence and is retained as a semantic failure. A
stronger final control requires scoped absence in opening/headings and failed-query
disclosure; the second rerun passes. Inputs/pass criteria never changed.

[Source inspection](release-source-review.md) is a Codex review, not independent
human grading. Ancillary optimizer-state lifetime wording in scenario 2 is not
established by its source. A nonstandard absence annotation in scenario 5 is not
valid citation syntax or absence evidence. These sample findings and verbosity
remain visible; basic principal-criterion passes do not certify every sentence.
Full quality validation and independent calibration remain P1.

## Local release output

`artifacts/releases/0.1.0-local-2026-10-03T07-35-47-244Z/` contains:

- `zettel-agent/`: **only** `main.js`, `manifest.json`, `styles.css`.
- ZIP with exactly those three paths; no keys, notes, recordings, reports or settings.
- `SHA256SUMS` and `SOURCE_STATE.json` outside ZIP, recording HEAD, dirty state,
  source hashes, Node/build hashes and any post-build documentation updates.

ZIP SHA-256: `12555692530cdf88b67143c0a3f44bb72e44ed005b7549d4bd9b82f3277401aa`.
Main SHA-256: `b8c941bfbbb4334c8ca900a14674c332fb90a9a26b02b25c97c9083930c1cedf`.

Version is 0.1.0 throughout; `versions.json` maps it to 1.11.5; desktop only.
Minimum-version and Windows/Linux installation are not separately verified or
claimed. The first public test must state its macOS validation scope.

## Failures and recovery preserved

Earlier sandbox app-service failures, two JavaScript harness syntax failures,
a fixture rename-link prompt, one concurrent temporary-note count failure and a
non-plugin-context import probe remain logged. Corrected free runs pass. Generated
release output is excluded from ESLint, consistently with other build artifacts.
The first live history assertion compared JSON insertion order; direct deep
comparison proved identical persisted content, and the corrected free UI test
passes. All eight original outputs, including the failure, replayed without
network before the loop change; obsolete scenario-5 traffic is retained unchanged.

Initial automatic approval rejected the fixture-to-DeepSeek transfer before any
process/request. The owner then explicitly confirmed it. One later approval
review timed out before launch; its permitted retry launched once. Neither event
is a model request, billed retry or erased sample.

**Remaining P0 blockers: none in the macOS / Obsidian 1.13.7 / DeepSeek Flash /
BM25 public-test scope.** No additional paid request is needed. This readiness
does not extend to other providers, minimum-version installation or other OSes.

## Deferred roadmap

**P1:**

- Full paired Agent/judge evaluation and independent human calibration.
- Fresh final exact-term/paraphrase/cross-language quality suite; observed suites
  are regressions, not a fresh holdout. Include the retained ancillary claim,
  scope/citation-format and verbosity findings from this smoke.
- More provider real smoke and strict v2 recordings/replay.
- Measured local memory, incremental updates and larger-vault performance.
- Windows/Linux verification; a public platform promise promotes its basic smoke
  to a release gate. Minimum-version testing remains a disclosed gap.
- CONTRIBUTING and issue templates.
- GitHub Release/community-directory submission only after separate publication
  authorization.

**P2:**

- Decide hybrid/self-review defaults only after their quality gates pass.
- Pure semantic mode.
- Slash workflows and link-suggestion experience.
- Vector DB/ANN only when measured performance/product triggers justify it.
- Independent planner tool only if actual investigations show a need.

Historical AI-only labels and limited/synthetic results are not independent human
validation, user-workload reliability or production guarantees.

## Deliverables and publication boundary

[README and project presentation](../README.md),
[visual provenance](assets/README.md), [compatibility](provider-compatibility.md),
[release safety ADR](adr/0027-release-safety-lifecycle-and-replay.md),
[final-context ADR](adr/0028-reserve-final-synthesis-context.md),
[installation/publish/rollback checklist](release-checklist.md),
[API report](release-api-results.md), [source review](release-source-review.md).

After the scoped gates pass and publication is authorized: review/commit the
accepted snapshot, run free CI, package/verify that exact commit, push/PR/merge as
authorized, tag the manifest version exactly, attach the three assets to a GitHub
Release and then follow the current official community-directory workflow. Only
actual release publication permits a Release download link. Source commit/push
is authorized separately; no tag, GitHub Release or directory submission has been
performed. The local package/source-state record remains the original pre-commit
snapshot, and should be rebuilt from the accepted commit before release.

## Documentation refinement — 2026-10-03

Per the owner's updated request, the root README is the single maintained public
project description for both the repository and the owner's website. Product
motivation, architecture, measured evidence and attribution are integrated there;
the separate case-study and bilingual project-card files were removed. The actual
fixture screenshot and supporting engineering records remain available. No website
was accessed or published as part of this edit.

These are documentation-only changes after the local package snapshot above;
its runtime assets, checksums and original source-state record are preserved.
No additional model request or package rebuild was performed.
