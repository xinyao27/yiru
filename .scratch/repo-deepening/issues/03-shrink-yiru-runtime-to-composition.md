# Shrink YiruRuntimeService to composition

Type: task
Status: resolved
Blocked by: 02

## Question

After Terminal authority extraction, which remaining mutable state clusters can be moved into already-real command/state-owner modules so `YiruRuntimeService` becomes a composition and coordination module rather than a universal interface? Implement the safe clusters exposed by the extraction and remove pass-through methods where callers can use the deeper module directly.

## Comments

### Ownership decision

`YiruRuntimeService` now exposes the existing file, Git, browser, and emulator command modules plus
the mobile notification channel as composition dependencies. Runtime RPC receives those modules in
its context, and spool hosts receive narrow Git command picks, so their handlers no longer use the
runtime as a service locator. Electron IPC retains direct access only at registration boundaries.

The browser command module now composes `BrowserRemoteScreencastAuthority`, which solely owns remote
screencast connection/page indexes, browser driver state, subscription cleanup, and desktop
take-back ordering. Explicit-page starts reserve the page before asynchronous CDP setup; implicit
active-page starts compare a desktop-claim revision after page resolution. Desktop reclaim therefore
wins even when it races a pending start.

`MobileNotificationChannel` now owns both live notification fanout and the bounded reconnect replay
sequence. This removes the split listener/replay ownership from the runtime and guarantees that live
delivery and catch-up use one monotonic watermark.

File, Git, browser, and emulator pass-through bindings were deleted. `yiru-runtime.ts` is 702 lines
smaller than the Ticket 02 baseline. Mobile session-tab coordination, worktree fetch/resolution,
terminal output analysis, account workflows, and automation state remain in the runtime because
their current consumers are orchestration paths rather than independent production owners; this
ticket does not create facade modules merely to move lines.

### Verification

- Focused authority checks: 4 files, 12 tests passed.
- Full suite: 13 files, 31 tests passed.
- Workspace typecheck, full non-fixing lint, format check, max-lines ratchet, and `git diff --check`
  passed. Full lint retains the pre-existing `keyboard-handlers.ts` exhaustive-deps warning tracked
  by ticket 09.
- Repository contracts reached the committed skill-manifest history check; local verification lacks
  historical release tags, matching the known Ticket 01 environment diagnostic.

### Review

- Standards review: no findings after fixing pending-start desktop reclaim, direct owner injection,
  and the screencast authority name.
- Specification review: no findings; direct module routing, notification sequencing, and explicit
  and implicit page take-back behavior preserve the Ticket 03 contract.
