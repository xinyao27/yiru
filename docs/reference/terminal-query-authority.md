# Terminal query authority

This document describes the shipped query-reply ownership contract for local, daemon, SSH, and
remote-runtime terminals.

## One live responder per byte chunk

The delivery decision is also the reply decision:

- Outside the targeted startup color shim below, a query delivered to a renderer view is answered
  by that view's xterm instance.
- A chunk dropped by the hidden-delivery gate with no remote subscriber is answered by the
  main-side headless emulator.
- A chunk with a remote view subscriber remains view-owned; main does not answer it even when local
  renderer delivery is gated.
- During a recognized fresh agent spawn, the startup shim may answer OSC 10/11 only when the
  captured owner is the desktop renderer, then strip those bytes before desktop delivery.
- Replayed snapshots and seeded history are never answered again.

`resolveTerminalQueryReplyOwner` evaluates this ownership once immediately before ingestion using
the same gate state as `shouldDropHiddenRendererPtyData`. The raw chunk then enters runtime
ingestion, while the captured owner follows the queued emulator write. Do not introduce another
general parser in the default model-responder path or decide ownership later in an async
continuation. The targeted startup color shim documented below is the sole independent parser and
runs only for renderer-owned chunks after runtime ingestion and before desktop delivery.

## View-attribute bridge

The renderer publishes one composed terminal-appearance snapshot through
`pty:terminalViewAttributes` at app startup and after theme or cursor settings change. Main applies
cursor style/blink to each runtime emulator and registers response handlers for palette, foreground,
background, cursor-color, and color-scheme queries that the headless xterm core cannot answer.

Runtime OSC color mutations are tracked per PTY on top of that base snapshot. Before the first
renderer publication, main remains silent for view-attribute queries; it must never fabricate a
default palette and reintroduce the historical default-background reply race.

## Kitty keyboard flags

The headless emulator parses kitty keyboard flag pushes and answers queries from the state the
hidden application actually established. Daemon snapshots may seed those flags into a fresh
main-side emulator, but renderer rehydrate sequences must not replay them: the renderer's deliberate
post-reattach kitty reset protects input from stale CSI-u modes.

Snapshot-free sessions begin with zero flags and rely on protocol-compliant applications to push
their desired mode again. Parsing kitty state must not affect terminal serialization.

## ConPTY DA1

Native Windows ConPTY detection is derived from the executing host, SSH connection, WSL path, and
shell override—not from the renderer client's platform. The spawn mark lets the emulator install
the `CSI ?61;4c` DA1 override before or immediately after emulator creation. Daemon data can create
an emulator before the awaited spawn response records the mark, so mark installation retrofits an
existing emulator idempotently. Every PTY teardown path must clear the mark.

## Transition races

- Visible to hidden: bytes delivered before the hidden mark reaches main remain view-owned. Once the
  mark lands, main owns queries in every chunk it drops.
- Hidden to visible: unmarking consumes the drop latch before the sequence-guarded snapshot restore.
  Replay guards prevent already-answered queries in the snapshot from being answered again.
- A query split across a deliver/drop boundary may be unanswered because neither parser saw the
  complete sequence, but it must never be answered twice.

`initiallyHidden` closes the blocking spawn-time ConPTY DA1 window for eligible local/daemon PTYs by
recording hidden ownership before their first bytes. Remote-runtime transports never use this mark.

## Phase 6: startup publication and default-path grammar removal

The default hidden-delivery/model-responder path no longer relies on the renderer's content-based
hidden-query grammar or the former broad client-specific startup window: main either delivers a
live chunk or drops it after model ingestion. The switch-off and delivery-interest compatibility
paths still scan arriving bytes to preserve renderer-owned startup queries. Their ordinary hidden
output follows the legacy policy: eligible chunks are skipped while latching a model-snapshot
restore, and non-skipped chunks enter the bounded background queue. That grammar is
compatibility-only and must not become a second default owner.

A separate five-second startup color shim remains for recognized TUI-agent fresh spawns on local,
daemon, and SSH providers. Immediately before runtime ingestion, the adapter captures one owner:
the hidden model when desktop delivery is dropped, a remote view while one is attached, or the
desktop renderer otherwise. Model and remote-view owners receive the raw query and suppress the
shim. Only a renderer-owned chunk runs the shim after raw runtime ingestion and before desktop
delivery. It replies to OSC 10/11 through the provider in one combined write and strips the matched
query only when that write succeeds. On failure it leaves the whole query for the renderer. The
shim retires after both slots are answered or the timeout expires and is not general query
authority.

The app publishes view attributes after settings load and before terminal reconnect/spawn, and
hidden spawns use `initiallyHidden`. Main responder writes follow the ordinary provider write path;
daemon shell-readiness queues them until the session can accept input. These startup rules keep
query ownership structural from byte zero on the default path without a client-specific timing
window.

## Session state owner

Mutable PTY records, emulators, subscriptions, and cleanup state live behind
`TerminalSessionAuthority`. `YiruRuntimeService` coordinates ingestion and provider writes; native,
daemon, SSH, relay, renderer, mobile, and web layers remain adapters to that authority.

## Kill switches

Outside the startup color shim, hidden model/emulator replies require main side-effect authority,
the hidden-delivery gate, and model query authority to all be enabled. Disabling any prerequisite
leaves replies with a delivered view or compatibility parser and must not create a mixed-owner
state. The startup shim has its own five-second lifecycle and does not read these switches, but the
captured owner still suppresses it whenever the model or a remote view owns the chunk.
