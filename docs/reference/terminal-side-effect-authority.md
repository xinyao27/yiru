# Terminal side-effect authority

This document defines where user-visible terminal output facts are derived.

## Ownership matrix

Local, daemon, and SSH PTY bytes transit the desktop main process. Main derives title changes,
bells, agent working/idle/exited transitions, command completion, hosted-review links, and Command
Code status once, then publishes typed side-effect facts. Remote-runtime PTY bytes do not transit
local main, so their renderer transport remains the parser.

The renderer has one fact consumer per PTY. Mounted panes and parked watchers replace one another;
they must never consume the same facts concurrently. Replay batches restore title state only and
must not replay attention, notifications, or completion events.

## Hidden delivery

Main ingests and updates the session model before the hidden-delivery gate can drop renderer-bound
bytes. A ref-counted renderer delivery interest suppresses dropping for byte-dependent sidecars.
The first dropped chunk records a restore marker; reveal consumes that marker and restores from the
authoritative model snapshot.

`TerminalSessionAuthority` owns the mutable PTY records, emulator state, listeners, subscriptions,
and cleanup registries. `YiruRuntimeService` coordinates output analysis and fact publication but
must not grow parallel state maps outside that authority.

## Slice 3: synthetic and derived facts

Synthetic hook title/bell frames enter `YiruRuntimeService.ingestSyntheticTitleFrame` directly.
They update the shared side-effect tracker without entering the emulator, transcript, output tail,
or byte accounting paths. Under main authority they are not copied to `pty:data`; the legacy copy
exists only for the switch-off renderer parser path.

Hosted-review links and OSC 133 command-finished events are emitted as typed facts from the same
main-side tracker. Renderer policy still decides notification timing, focus suppression, unread
attention, and task-complete behavior.

## Migration switch and double-fire prevention

`terminalMainSideEffectAuthority` is default-on. When it is disabled, renderer byte parsers retain
the legacy local behavior. Authority is selected when a transport or watcher is created, never per
chunk, so one PTY cannot double-fire side effects during settings hydration.

## Open items: byte sidecars and switch retirement

Raw-byte sidecars for paste readiness, background startup pacing, and automation observation still
register ref-counted delivery interest. When a parked watcher is in the switch-off compatibility
path, its byte-based mode-2031 responder does the same. The hidden-delivery gate must not drop bytes
while any such interest is active.

If `terminalMainSideEffectAuthority` is retired, delete the local/SSH renderer parsers, the parked
watcher's byte-parser compatibility path, and the legacy synthetic `pty:data` copy together. Until
then, these paths are compatibility code, not duplicate production owners.
