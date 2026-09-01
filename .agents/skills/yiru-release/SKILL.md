---
name: yiru-release
description: Prepare, publish, and monitor coordinated Yiru releases across the daemon, npm, Homebrew, Chrome Web Store, iOS TestFlight, and the optional APNs gateway. Use for release readiness, version preparation, publishing, retrying, or release-status requests in the Yiru repository.
---

# Yiru Release

Coordinate releases through the repository-owned conductor. Keep signing and provider credentials in
GitHub Actions; never move secret values into the checkout or command output.

## Load the release contract

Before changing or publishing anything, read:

- `docs/reference/releasing.md`
- `scripts/release.mjs`
- the workflows for the selected targets in `.github/workflows/`

Treat those files as authoritative. Improve them when the workflow itself is broken instead of
encoding a divergent workaround in this skill.

## Preserve authorization boundaries

Readiness checks, builds, and inspection are safe to perform when relevant. Committing, pushing,
merging, creating tags, dispatching workflows, publishing registries, and submitting store builds
require explicit user authorization for that release operation. A request to inspect readiness is
not authorization to publish.

Never print secret values. Query only secret names and provider readiness. Use
`pnpm release:setup` when a human must create or paste credentials. Do not bypass the conductor's
typed confirmation with `--yes` unless the user explicitly requests non-interactive publication.

Do not stash, reset, discard, or silently include unrelated worktree changes. Stop on version, tag,
branch, remote, credential, or artifact mismatches.

## Select the release

Establish the stable semantic version and requested targets before publication. The default
conductor targets are:

- daemon binary, GitHub Release, Homebrew Formula, and npm CLI
- Chrome Web Store extension
- iOS TestFlight with the internal audience

APNs is optional and is included only when the user requests it or the current release task
explicitly includes the gateway. External TestFlight requires an external changelog. Uploading to
TestFlight does not publish the app to the production App Store; report that manual App Store
submission separately.

## Check readiness

Confirm all of the following without exposing credentials:

1. Node.js is major version 24, Bun is exactly 1.4.0, pnpm is available, and `gh` is authenticated
   to `xinyao27/yiru`.
2. The four release package versions agree.
3. The release commit will be on a clean `main` exactly matching `origin/main`.
4. Repository and `chrome-web-store` environment Secret names satisfy the selected targets.
5. `NPM_TOKEN` exists when `@yiru/cli` has not yet been published. Prefer npm Trusted Publishing
   after the first release.
6. `APNS_GATEWAY_ENABLED=true` and all APNs/Cloudflare secrets exist before selecting `--with-apns`.

When releasing feature-branch work, first inspect the complete diff, run `pnpm check` and the
affected production builds, commit only in-scope changes, push the branch, wait for required PR
checks, merge only when authorized, and then update local `main` with a fast-forward pull.

## Prepare and publish

From a clean, published `main`:

```bash
pnpm install --frozen-lockfile
pnpm release -- prepare VERSION
```

Review the generated version, Formula URL, checksum, and package changes. Commit and push exactly
the release files printed by the conductor. Then publish using the selected options:

```bash
pnpm release -- publish VERSION
pnpm release -- publish VERSION --ios-distribution external --ios-changelog 'CHANGELOG'
pnpm release -- publish VERSION --with-apns
```

Use `--skip-*` only when the user chose a partial release. Existing release tags at the current
commit are an idempotent retry path; never move an existing tag to another commit.

## Monitor to a terminal result

Run `pnpm release -- status VERSION`, inspect every selected GitHub Actions run, and wait until each
has succeeded or produced a concrete failure. Retry only transient or explicitly idempotent steps;
do not repeatedly resubmit store releases or mutate tags speculatively.

Finish with the version, commit, tags, workflow URLs, artifact/store status, any provider review
still pending, and any manual App Store action that remains.
