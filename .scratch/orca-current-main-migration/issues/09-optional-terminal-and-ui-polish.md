# Complete recoverable terminal and UI polish

Type: task
Status: deferred
Blocked by: 01, 06

## Question

Which small, recoverable interaction defects are still worth adopting after the correctness wave, and
how should they use Yiru's existing event owners, UI primitives, and design tokens?

## Scope

- `108a2ad41`: accept absolute CLI paths for file open/diff and convert them before runtime RPC.
- `34caad787`: prevent Browser guest Ctrl/Cmd+Tab from leaving the switcher stuck.
- `2cf41ab86`: keep the Mobile xterm caret visible while its webview is inactive.
- `4e670d3e4`: discard queued wheel replay after TUI mouse reporting turns off.
- `b5ae776c3`: clear xterm's active match along with terminal search decorations.
- `fc181a849`: restore readable count separators in CJK terminal-theme strings.
- `1f29a33b2`: avoid sticky-pinning a virtual Project header without mounted geometry.
- `1b5db4bc2`: reflow after macOS occlusion reveal so the bottom bar is not clipped.

## Acceptance

- Each change is independently observable and recoverable without it; none becomes new cross-layer
  state authority.
- UI edits follow `docs/style-guide.md`, platform shortcuts use runtime platform checks, and CJK
  localization verification passes.
- Add tests only for event-order, path-namespace, or geometry state machines; use manual/visual checks
  for caret, occlusion, and presentation copy.

## Commit boundary

At most two optional commits: input/path behavior and presentation/geometry polish.
