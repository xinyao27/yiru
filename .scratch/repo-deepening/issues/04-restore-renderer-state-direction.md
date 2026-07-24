# Restore renderer state direction

Type: task
Status: resolved
Blocked by: 03

## Question

Remove view-owned registries, toast behavior, and view types from Zustand state implementations; introduce concrete domain command modules for effects and results; eliminate the large renderer type-dependency cycle without changing UI behavior or global-store semantics.

## Comments

### Ownership decision

Terminal/browser registries, pet/contextual-tour caches, view-independent editor/link/layout logic,
and skill/scroll-anchor notification state now live under concrete `runtime/` or `lib/` owners. The
Zustand store has no imports from `components/`, `hooks/`, or `sonner`; PTY buffering also stays
within runtime all the way through its UTF-8 clamp leaf.

Store mutations publish typed semantic results to one bootstrap-installed presentation owner.
Results emitted before installation are queued in order, so renderer startup and React remounts do
not lose user-visible feedback. Remote session commands return explicit success/failure results;
their eager tab refresh owner is registered at runtime module initialization and reports a missing
owner instead of silently succeeding. Browser staging preserves focus intent, avoids duplicate
mirrors when a subscription wins the race, and retains the original host-snapshot freshness gate.

`AppState` is now an import-free leaf interface completed in `slice-contracts.ts`; the former
`types -> every slice -> types` strongly connected component is gone. The renderer graph has no
store-crossing SCC, and the former `web-runtime-session <-> web-session-tabs-sync` cycle is also
removed. Low-level non-Git persistence is explicitly named `registerNonGitFolder`; the complete
onboarding, worktree-fetch, activation, and sidebar-reveal flow remains in the concrete add-folder
command used by every user entry point.

### Verification

- Full suite: 13 files, 30 tests passed. No test files were added or changed in this ticket.
- Desktop typecheck, renderer non-fixing lint, renderer format check, max-lines ratchet,
  localization catalog/coverage, dependency-cycle scan, and `git diff --check` passed. Lint retains
  only the pre-existing `keyboard-handlers.ts` exhaustive-deps warning tracked by ticket 09.
- Repository contracts pass through design tokens, max-lines, and bundled skill guides, then stop at
  the known local prerequisite: historical `yiru-cli` release tags are not present for the skill
  manifest history check.

### Review

- Specification review: no findings after verifying toast timing/content, folder activation,
  remote tab focus/refresh, PTY shutdown/restore, and the absence of low-value tests.
- Standards review found and then confirmed fixes for the residual PTY component dependency, the
  misleading low-level folder action name, and React-effect-owned result/refresh channels. Final
  review reported no findings.
