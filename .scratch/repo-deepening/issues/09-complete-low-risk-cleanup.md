# Complete low-risk cleanup

Type: task
Status: resolved
Blocked by: 08

## Question

Resolve the remaining audit ledger: fix the lint warning with the correct effect/ref policy, restore or replace missing authority documentation references, classify the twelve repository-unreferenced maintenance scripts, delete only proven-dead scripts, and prune every max-lines baseline entry made stale by the refactors.

## Comments

## Resolution

- Fixed the sole repository lint warning by adding the stable `panePtyBindingsRef` dependency to
  the keyboard-handler effect; no behavior or subscription lifetime changed.
- Deleted six proven-dead maintenance scripts: two completed localization codemods, a redundant
  locale wrapper, an orphaned spinner fixture, the superseded React Doctor wrapper, and the
  obsolete Windows inner-signature wrapper. Documented the seven intentional operator-run tools
  in `apps/desktop/config/scripts/manual-maintenance.md`; every remaining unreferenced script is in
  that ledger and every absent script has a repository-owned caller.
- Restored current authority references for terminal query ownership, side-effect ownership, and
  hidden-view parking. The documents now contain every section referenced by code and describe the
  shipped local, daemon, SSH, remote-view, renderer, and compatibility-switch behavior.
- Resolved a startup OSC 10/11 double-responder edge discovered during review: adapters capture one
  `TerminalQueryReplyOwner`, runtime always ingests the original provider bytes with that same
  owner, and the narrow startup shim runs only for renderer-owned chunks before desktop delivery.
  Multi-slot replies use one provider write and expose the complete query to the ordinary owner on
  failure.
- Added only behavioral regressions for reply-owner selection and atomic startup replies; no
  class-name, export-existence, or source-text tests were added.
- Ran the max-lines prune command: it removed no entries because all 232 grandfathered suppressions
  still correspond to live files. The normal ratchet reports no stale or newly introduced bypasses.
- Validation passed: repository formatting and lint with zero warnings, full typecheck, 21 test
  files / 55 tests, maintenance-script syntax checks, max-lines ratchet, `git diff --check`, and two
  independent code reviews. The aggregate repository-contract command reaches the existing
  `yiru-cli` release-tag-history precondition after its preceding checks pass; regenerating release
  artifacts requires the missing release tags.

