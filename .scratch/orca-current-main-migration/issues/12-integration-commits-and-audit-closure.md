# Integrate commits and close the Orca delta audit

Type: task
Status: open
Blocked by: 11

## Question

Can the final branch prove that the fixed Orca delta is completely triaged and the selected behavior
is migrated as coherent commits without relying on implementation agents' transient context?

## Scope

- Review each implementation ticket against its Orca diff and Yiru acceptance criteria.
- Resolve only cross-ticket integration conflicts and remove duplicate policy/state introduced by
  parallel work.
- Update `docs/reference/orca-upstream-feature-gap-audit.md` or add a linked delta-closure section
  recording all 49 commits in `817197fc3..1bd36ce04` exactly once.
- Re-run an incremental upstream query at closure; new commits form a new bounded delta rather than
  silently changing this map's endpoint.

## Acceptance

- All 25 must-migrate and 13 later-wave behaviors are migrated or evidence-backed equivalent.
- `5a1ca2426` and `1367094bb` have recorded equivalence evidence without unnecessary code.
- The nine exclusions in `triage.md` remain excluded and no removed/false product surface is added.
- Commit history follows ticket boundaries, with no raw Orca cherry-picks or unrelated user changes.
- Final verification from ticket 11 passes after integration, `git diff --check` is clean, and the
  worktree has no uncommitted migration changes.
- The audit includes fixed hashes, counts, reproduction commands, and one-to-one coverage checks.

## Commit boundary

One final audit/closure commit after all implementation commits and verification fixups.
