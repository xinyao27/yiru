# Manual maintenance scripts

Run these from `apps/desktop`. They are intentionally not package scripts or CI gates because each
one mutates source/assets, launches an interactive diagnostic environment, or requires a specific
host and operator intent.

| Script | Purpose and operating constraint |
| --- | --- |
| `bootstrap-locale-catalog.mjs` | Rebuild one locale from the English catalog with `--locale <code>`; it calls an external translation service and rewrites the selected catalog/cache. |
| `dev-fresh-profile.sh` | Launch desktop development with a temporary first-run profile on a Bash host. |
| `localize-renderer-strings.mjs` | Apply the localization codemod to audited renderer candidates and update `en.json`; review the resulting source diff. |
| `macos-launch-diagnostics.sh` | Download and diagnose a published macOS build; it intentionally rejects non-macOS hosts. |
| `repair-locale-catalog.mjs` | Reapply deterministic locale repair policy, optionally with `--locale <code>`, and rewrite catalog caches. |
| `serve-headless-fresh-profile-pairing.mjs` | Start a disposable headless runtime and print its mobile pairing URL for manual pairing tests. |
| `vendor-feature-wall-assets.mjs` | Copy and normalize feature-wall media from the marketing repository; set `YIRU_MARKETING_REPO` when it is not in the default location. |

Scripts absent from this list must have a repository-owned caller (package script, workflow, test,
or imported module). A zero-reference file is not a supported entrypoint by accident.
