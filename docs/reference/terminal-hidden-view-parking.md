# Terminal hidden-view parking

Parking releases a hidden terminal tab's renderer xterm tree while keeping its PTY session and
main-side model alive. It is a renderer resource policy, not a second session authority.

## Eligibility

A tab may park only when every pane has a valid terminal leaf and a daemon-backed local PTY for the
same worktree. SSH, remote-runtime, and daemon-fail-open local sessions stay mounted because they do
not have the required local snapshot contract. Visible, measuring, activity-owned, pending-spawn,
and floating-panel tabs are excluded by the parking policy.

## Side effects while parked

Unmounting a pane also removes its ordinary fact consumer and exit observer. One pane-less parked
watcher per PTY therefore takes over title, bell, completion, and exit policy. Under main
side-effect authority it consumes typed facts; with the compatibility switch off it uses the
legacy byte path and registers delivery interest so main cannot drop the bytes it needs.

Reveal, tab close, PTY exit, and worktree teardown dispose the parked watchers. If a PTY exits while
parked, the watcher performs the same tab or split-leaf cleanup that a mounted pane would perform.

## Restore contract

Main drops renderer-bound bytes only after model ingestion. The first gated drop records that a
restore is required. Reveal unmarks the PTY before requesting the sequence-guarded snapshot, so new
live bytes cannot be lost behind the restore. `TerminalSessionAuthority` remains the sole owner of
the PTY/emulator graph throughout parking and reveal.
