# Complete recoverable workflow and worktree polish

Type: task
Status: deferred
Blocked by: 04, 07

## Question

How should setup/onboarding eligibility and sparse-checkout display become current without expanding
the correctness-critical migration wave?

## Scope

- `deb2b50e7`: revalidate setup-script prompt eligibility on focus/worktree changes.
- `9ced27eca`: skip Computer Use setup when the macOS helper is unavailable.
- `e3cc08f18`: distinguish disabled sparse checkout from an active sparse worktree.

## Acceptance

- Setup prompts reflect the currently effective hook after focus/worktree transitions.
- Onboarding cannot dispatch a known-unavailable helper action.
- Sparse-checkout state checks configuration as well as the retained info file and preserves Git 2.25
  compatibility.
- Focused tests cover stale eligibility and sparse configuration boundaries; do not test static copy.

## Commit boundary

One optional workflow/worktree-polish commit.
