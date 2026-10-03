# Local installation, publication and rollback checklist

No commit, push, PR, tag, GitHub Release or directory submission has been performed.
Use [readiness](release-readiness.md) as the evidence record. Only all required P0
gates passing permits “ready for first public test”; this is not a quality guarantee.

## Local snapshot

- Run `npm ci` with Node 24, `npm run check`, then `npm run release:package`.
- Production build must ignore an inherited `OBSIDIAN_PLUGIN_DIR`; explicit fixture
  copy uses `--copy-to-vault`. Never point tests at an owner's vault.
- Confirm package/manifest version `0.1.0`, versions mapping `1.11.5`, desktop flag.
- Inspect the ZIP: only `zettel-agent/main.js`, `manifest.json`, `styles.css`.
- Compare `SHA256SUMS`; retain `SOURCE_STATE.json` outside the installable ZIP.
  It identifies HEAD plus every tracked/nonignored untracked source hash and dirty
  state. An uncommitted snapshot must not be described as a tagged release.
- Use `E2E_RELEASE_PACKAGE=/absolute/path/to/artifacts/releases/<snapshot>/zettel-agent`
  with the targeted free E2E command to install those exact three assets (global
  setup skips rebuilding) into the fixture; verify bundle hashes afterward.
- Install those exact three assets into an isolated fixture, enable/reload, check
  setup/no-key/empty-folder, citation/Copy/Insert, cancellation/history and replay.
- Freeze/pass the eight bounded live scenarios once authorized; retain failures,
  usage, unknown reservations, strict zero-network replay and a source-review sheet.
- Confirm README screenshots and compatibility claims match the final
  snapshot. No keys, personal notes, report/recording/test assets enter the ZIP.

## After publication authorization

1. Review the complete dirty diff, attribution, license and unresolved P0 gates.
2. Commit the accepted snapshot; run locked free CI and targeted fixture checks.
3. Rebuild/package that exact commit; compare source/build hashes and install it.
4. Push the accepted branch/PR as separately authorized; review and merge.
5. Create a version tag **exactly** matching `manifest.json` (`0.1.0`, no `v` prefix)
   and a GitHub Release with standalone `main.js`, `manifest.json`, `styles.css`
   attachments. Publish accurate prerelease/testing scope and limitations.
6. Only then add an actual Release download link to README.
7. If community-directory submission is authorized, use the current official
   workflow: sign in to `community.obsidian.md`, link GitHub, and submit/claim the
   plugin. The directory reads the default branch's committed manifest and the
   matching Release. Address automatic review findings with a new version/release.

Sources checked 2026-10-02: [official submission](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin),
[submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).
The current documented directory process must not be replaced with an obsolete
assumption that all submissions are repository-list PRs.

## Rollback

Disable the plugin, quit Obsidian, back up its directory (including `data.json`,
conversations, recordings and recovery files), and replace only the three release
assets with a known-good package. Re-enable and inspect settings/history. Do not
remove vault notes or credentials. Older binaries may not understand newer optional
fields/bindings: keep backups, use a new chat, and do not rewrite frozen recordings
or delete recovery data to make an old build appear compatible. The derived local
cache may be rebuilt by the host later; it is never a source-note backup.
