# Complete agent session resume and live-state behavior

Type: task
Status: done
Blocked by:

## Question

What is the smallest coherent implementation that makes cross-agent continuation, provider resume,
startup replay, live-PTY ownership, and restart delivery correct without creating a second session
authority?

## Scope

- `877bbdebf`: reuse the pane that owns a live background Pi session instead of forking a duplicate.
- `739fce528` (partial): buffer remote Codex startup snapshots until layout/tab hydration and replay
  each snapshot exactly once.
- `53222cc9c`: wait for shell readiness before restarting Codex for an account switch.
- `cb19e7950`: persist and use Claude's immutable session start directory for resume.
- Regress the reported flow that continues a Claude session from a Codex/new-agent action; the
  source transcript, chosen target provider, and runtime host must not be conflated.

## Ownership boundary

Prefer the existing session identity, sleeping-agent ownership, hook metadata, and terminal lifecycle
modules. Treat provider, runtime host, provider-session id, start cwd, and live PTY id as distinct
identities; do not add renderer-only truth that can disagree with main/runtime state.

## Acceptance

- A live provider session maps to one pane across foreground/background transitions and reconnects.
- A startup snapshot arriving before renderer hydration is eventually applied once, not dropped or
  duplicated.
- Resume uses the recorded start cwd even if later events report a different cwd.
- Codex account restart never writes to a shell that has not become ready.
- Focused tests cover identity reuse, workspace reopen without tab multiplication, pre-hydration
  replay, cwd semantics, shell readiness, and cross-provider continuation.

## Commit boundary

One agent-session commit. Do not mix in generic terminal interaction fixes from ticket 06.
