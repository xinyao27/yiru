# Characterize Terminal authority invariants

Type: task
Status: resolved
Blocked by:

## Question

What is the smallest executable characterization net that proves current Terminal graph, driver, layout, subscription, recovery, and cleanup behavior across desktop, mobile, SSH/relay, and daemon paths before ownership moves? Add that net, ensure PR CI runs the existing test suite, and record the proven invariants.

## Comments

### Characterization net

The executable boundary is the public `YiruRuntimeService` API plus the SSH multiplexer/provider and
daemon adapter at their transport clients. The tests intentionally avoid private maps so the next
ticket can move state ownership without rewriting the specification.

- Graph and recovery: a host-scoped PTY is adopted into the renderer graph, keeps its worktree and
  connection context, becomes unavailable during reload, and is re-adopted when an incomplete
  recovery graph republishes the live leaf.
- SSH/relay routing: the real multiplexer and provider route data/exit notifications to host-scoped
  app PTY ids and translate app-scoped resize commands back to relay-local ids.
- Daemon recovery: the real adapter reconciles minted session ownership, preserves live sessions,
  kills orphans, and routes resize, data, and exit through its client boundary.
- Subscription authority: remote views are reference-counted with idempotent releases; replacing a
  stable subscription id detaches the old relay connection, and concurrent cleanup joins exactly
  one cleanup for the current generation.
- Driver and layout authority: overlapping mobile-floor and desktop-reclaim transitions stay
  ordered, layout sequence and fit baseline agree, and desktop reclaim restores original geometry.
- Exit cleanup: PTY exit with an active mobile fit removes every publicly observable driver, layout,
  fit override, and mobile view subscription.

The runtime state-machine test remains provider-neutral so native desktop, daemon, WSL, and SSH
relay adapters enter one authority transition. Focused adapter tests then prove the transport-owned
parts: framed SSH relay routing and daemon cold-start reconciliation/event fanout.

PR CI now runs `pnpm exec vp test --run`, so this net and the repository's existing tests fail the
same verify job that already owns lint, typecheck, repository contracts, and the unpacked build.

### Verification

- Focused characterization: 2 files, 7 tests passed.
- Full suite: 11 files, 26 tests passed.
- Workspace typecheck, changed-file lint/format, full lint, and max-lines ratchet passed. Full lint
  retains the pre-existing `keyboard-handlers.ts` exhaustive-deps warning tracked by ticket 09.
- Repository contracts reached the committed skill-manifest history check; local verification lacks
  historical prerelease tags, the exact diagnostic PR CI already downgrades to an explicit warning.
- Two-axis standards/spec review completed with no remaining findings after fixes.
