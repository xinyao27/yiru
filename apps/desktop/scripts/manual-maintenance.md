# Manual maintenance scripts

Run these from `apps/desktop`. They are intentionally not package scripts or CI gates because each
one mutates source/assets, launches an interactive diagnostic environment, or requires a specific
host and operator intent.

| Script | Purpose and operating constraint |
| --- | --- |
| `bootstrap-locale-catalog.mjs` | Rebuild Simplified Chinese from the English catalog with `--locale zh`; it calls an external translation service and rewrites the catalog/cache. |
| `dev-fresh-profile.sh` | Launch desktop development with a temporary first-run profile on a Bash host. |
| `localize-renderer-strings.mjs` | Apply the localization codemod to audited renderer candidates and update `en.json`; review the resulting source diff. |
| `macos-launch-diagnostics.sh` | Download and diagnose a published macOS build; it intentionally rejects non-macOS hosts. |
| `repair-locale-catalog.mjs` | Reapply deterministic Simplified Chinese repair policy and rewrite its catalog cache. |
| `serve-headless-fresh-profile-pairing.mjs` | Start a disposable headless runtime and print its mobile pairing URL for manual pairing tests. |

Scripts absent from this list must have a repository-owned caller (package script, workflow, test,
or imported module). A zero-reference file is not a supported entrypoint by accident.
