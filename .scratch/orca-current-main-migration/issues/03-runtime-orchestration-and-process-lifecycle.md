# Complete runtime orchestration and process lifecycle fixes

Type: task
Status: done
Blocked by:

## Question

How can the runtime preserve long-running orchestration calls, safe startup cwd selection, and full
Windows agent-process cleanup without weakening global timeouts or cross-platform safety?

## Scope

- `cd28da13f`: classify `orchestration.ask` as a long-poll so it survives the 30-second idle wall.
- `dc18ba9cd` (partial): stop the complete Windows agent PTY descendant tree on termination.
- `559f04d29`: resolve the daemon's safe default cwd before applying agent-startup cwd policy.

## Ownership boundary

Keep method-specific timeout policy in RPC classification, process-tree termination in the native PTY
provider, and cwd safety in daemon launch preparation. All platform-specific behavior must remain
behind runtime checks.

## Acceptance

- `orchestration.ask` can remain idle beyond 30 seconds while ordinary RPCs retain their current
  timeout behavior and cancellation semantics.
- Windows agent stop terminates descendants without invoking `taskkill` for non-agent PTYs or on
  non-Windows hosts.
- Daemon launch validates the resolved fallback cwd, never raw `undefined`, and still rejects unsafe
  explicit paths.
- Focused tests cover timeout classification/cancellation, Windows descendant cleanup, and cwd
  fallback ordering.

## Commit boundary

One runtime-lifecycle commit, split only if native process termination requires an independently
releasable packaging change.
