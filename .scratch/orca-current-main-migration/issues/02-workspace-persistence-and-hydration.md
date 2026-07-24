# Repair workspace persistence and hydration invariants

Type: task
Status: done
Blocked by:

## Question

How should repository, worktree, workspace-session, and active-selection state reconcile so deleted
resources cannot be recreated by stale sort or hydration snapshots?

## Scope

- `253ccd29f`: remove current and legacy workspace-session state when a project is removed, scoped
  to the owning execution host.
- `d8499fae1`: prevent sidebar sort-order snapshots from minting authoritative `worktreeMeta` rows.
- `c2371c0cd`: refuse headless Mobile hydration for a repository that no longer exists.
- `143d2232b`: clear or replace a stale `activeWorktreeId` after live worktrees hydrate.

## Ownership boundary

Put existence and cleanup policy in the persistence/runtime authority that owns the resource. Sort
order and renderer hydration are projections and may reference only live authoritative identities.
Keep native, WSL, SSH, and paired-runtime ownership isolated.

## Acceptance

- Removing one project prunes its workspace sessions without damaging same-path or same-id state on
  another execution host.
- Sorting cannot create a repository/worktree record.
- A deleted repository cannot return through headless Mobile hydration or renderer rehydration.
- Active selection deterministically falls back to a live worktree or no selection.
- Focused migration/reconciliation tests cover legacy state, host isolation, stale snapshots, and
  concurrent hydration order.

## Commit boundary

One persistence/hydration commit. Avoid unrelated schema cleanup.
