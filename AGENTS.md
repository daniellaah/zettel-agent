# Notes for coding agents

- Run `npm run check` after every change.
- Test only against the sample vault in `fixtures/vault`, never a personal vault.
- `npm run e2e` restarts Obsidian on the sample vault and closes any open Obsidian window.
- `npm run e2e:live` and `EVAL_ALLOW_API=1 npm run eval:full` call paid model APIs. Ask before running them.
