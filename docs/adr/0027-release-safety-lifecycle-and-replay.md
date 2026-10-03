# ADR-0027: Safe opens, turn ownership and recoverable host storage

- Status: Accepted
- Date: 2026-10-02
- Refines: ADR-0008, ADR-0010, ADR-0022, ADR-0026

Citation navigation obtains an existing file by its exact saved vault-relative path
and calls `openFile`, never creation-capable `openLinkText`. Missing/renamed/out-of-
scope targets fail visibly; stale content opens the current note with a warning and
without a stale heading. Ordinary internal links resolve once to an existing file
and use the same non-creating API. Chat click capture prevents the renderer's own
link handlers from also opening a target. User-only Copy/Insert and note creation
remain outside the Agent boundary.

Each turn owns an AbortController from before initialization. Initialization is
abortable even when its dependency ignores the signal. Events and completion
check controller identity; stop closes UI tool entries immediately and detached
work cannot update a newer turn, history or ledger. Closing a view or unloading
stops the turn. Saved history remains available on reopening. Initialization and
storage errors surface without serializing exception details or secrets.

Host persistence uses a serialized adapter queue, immutable snapshots, schema/ID
validation and a pending-file/backup/rename protocol. Complete pending writes are
recoverable after interruption; malformed files remain intact and are skipped in
lists. Individual chat files are authoritative, avoiding stale legacy index
trust. Persistent deletion tombstones prevent late saves resurrecting a chat.
This is recoverability under Obsidian adapter operations, not a claim of POSIX
fsync durability. Chats/cache/recordings are host infrastructure, never model-
controlled note writes.

New cassettes live under `recordings/v2`, leaving historical files untouched.
Replay binds corpus revision, retrieval mode and answer-check mode, then compares
every full wire request (including history, prompt, tools and delivered evidence).
Legacy v1 recordings remain usable in explicit historical SDK regression tests;
the plugin does not silently replay their unbound answers. Hybrid recordings are
refused because offline BM25 cannot reproduce their rankings safely. Request
comparison may reject benign protocol changes; re-recording is safer than silently
changing evidence identities. No replay path falls back to network.

The composition root is `ui/Plugin.ts`, re-exported from `main.ts`, so all Obsidian
imports respect the original layer rule. New installs select DeepSeek Flash for
bounded first-test work; existing choices remain. Minimum app version is 1.11.5,
the public SecretStorage encryption update, with current smoke on 1.13.7/macOS
and older/cross-platform verification explicitly pending. Recording errors are
associated with originating conversation/item identity. Distinct run files and
monotonic exchange counts protect recordings from late/incomplete replacement.
