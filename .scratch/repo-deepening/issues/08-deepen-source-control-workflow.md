# Deepen provider-neutral source-control workflow

Type: task
Status: resolved
Blocked by: 07

## Question

Move provider-neutral status, operation, review result, refresh, and recovery behavior behind one deep workflow module used by desktop and mobile view adapters, while preserving Git 2.25, native/WSL/SSH host scope, and GitHub/GitLab/Bitbucket/Azure DevOps/Gitea adapter behavior.

## Comments

## Resolution

- Centralized provider-neutral primary-action, review prerequisite, operation follow-up, refresh, and recovery policy in `@yiru/workbench-model`, exported through the existing `review` entrypoint so package exports do not grow with each workflow module.
- Replaced desktop and mobile decision/recovery duplicates with thin adapters while preserving provider-specific behavior and Git 2.25-compatible command paths.
- Made desktop repository ownership and hosted-review refresh routing exact across native, WSL, SSH, and relay hosts by resolving `repoId + path + host` and failing closed on ambiguity.
- Unified mobile rejected-push recovery and hosted-review refresh behavior across source-control and review empty-state entrypoints.
- Added only behavioral regression tests for operation policy, host routing, recovery, and status preservation; no class-name, export-existence, or source-text tests were introduced.
- Validation passed: repository formatting and changed-file lint, full typecheck, 19 test files / 51 tests, max-lines ratchet, workbench-model CJS/ESM build, desktop electron-vite build, web build, localization checks, `git diff --check`, and two independent code reviews. The aggregate repository-contract command reaches the existing release-tag-history precondition for `yiru-cli` and cannot regenerate release artifacts without the missing tags.

