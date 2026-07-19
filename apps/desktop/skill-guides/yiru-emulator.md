---
name: yiru-emulator
description: >
  Control a mobile (iOS) emulator / simulator stream from inside Yiru using the `yiru` CLI.
  Use for taps, gestures, typing, hardware buttons, camera injection, permissions, accessibility tree, and more — all while seeing the live view in Yiru's emulator pane.
  Prefer this over raw `npx serve-sim` or direct simctl when running agents inside Yiru (the yiru surface handles device scoping, helper lifecycle, and worktree context).
  Complements the yiru-cli skill for terminals, worktrees, and the built-in browser.
license: Apache-2.0
---

# Yiru Emulator (serve-sim powered)

Drive an Apple Simulator (iOS / iPad / Watch) **from within Yiru** using `YIRU emulator ...` commands (or `YIRU emulator exec` for raw power). This wraps the excellent [serve-sim](https://github.com/EvanBacon/serve-sim) open-source tool so agents get a consistent Yiru-native CLI surface, automatic helper management, and seamless integration with Yiru's live emulator pane (the visual "preview" surface).

The underlying serve-sim helper captures the real simulator framebuffer (via private SimulatorKit / IOSurface for low-latency 60fps H.264 or MJPEG) and exposes a WebSocket control channel. Yiru's bridge owns the helper processes and per-worktree "active emulator" state so unqualified commands "just work" on whatever device/pane is current for the worktree.

## CLI executable

Choose the Yiru executable once: use the `YIRU_CLI_COMMAND` environment value when set;
otherwise use `yiru-dev` in a dev session exposing `YIRU_DEV_REPO_ROOT`, and `yiru`
everywhere else.

In every command example — fenced blocks, tables, and prose — `YIRU` is a documentation
placeholder. Replace it with the chosen executable before running the command; do not
create a shell variable or run `YIRU` literally. The command examples are intentionally
shell-neutral for POSIX shells, PowerShell, and cmd.exe.

## When to use

- The user/agent wants to **tap, swipe, drag, pinch, or press hardware buttons** on a running iOS simulator while seeing the live result in Yiru.
- You want **camera injection** (placeholder, webcam, or file loop) for testing camera flows.
- You need to **grant/revoke app permissions** (camera, photos, notifications, location, etc.) or read the **accessibility tree**.
- Rotate the device, simulate memory warnings, toggle CoreAnimation debug overlays, etc.
- You are inside a Yiru worktree/terminal and want the emulator to be **workspace-scoped** (like browser tabs) with explicit targeting when needed.
- The agent should use Yiru's preview pane instead of external Simulator.app or raw serve-sim URLs.

**When NOT to use**
- Android emulators → use the `yiru-emulator-android` skill (same `YIRU emulator` namespace, cross-platform via adb/emulator).
- Building or installing the app itself → use `xcodebuild`, `xcrun simctl install`, `expo run:ios`, etc. (launch the app, then use `YIRU emulator` to drive it).
- In-app debugging (state, network, views) → use the app's own tools or the browser pane if it's a webview.
- Remote/SSH worktrees for emulator control (currently out of scope / unsupported; simulator hardware is local to a Mac).

## Prerequisites (enforced / surfaced by Yiru)

- macOS host (with Xcode Command Line Tools: `xcrun --version`).
- A booted simulator (`xcrun simctl list devices booted` or let Yiru/attach help boot one).
- Node available (for the serve-sim bits; Yiru bundles the CLI surface).
- macOS 14+ recommended for full camera injection features.

Yiru will give clear errors if these are missing (e.g. "emulator commands require macOS + Xcode tools").

An active emulator "session" for the worktree is required for most commands. Use `YIRU emulator list` / `attach` or open the emulator pane in the UI.

## Mental model

```text
┌────────────────────┐
│ Yiru worktree      │
│  - active emulator │◄── YIRU emulator tap / type / ...
│  - live pane (UI)  │
└─────────┬──────────┘
          │ (registers active stream)
          ▼
┌────────────────────┐   WS / control   ┌─────────────────┐  framebuffer  ┌──────────────┐
│ Yiru EmulatorBridge│ ───────────────► │ serve-sim-bin   │ ────────────► │ iOS Simulator│
│ (main process)     │ (or exec serve-sim) (per-device)   │               └──────────────┘
└────────────────────┘                  └─────────────────┘
          ▲
          │ (state + lifecycle)
┌────────────────────┐
│ yiru CLI (agents)  │  e.g. YIRU emulator tap 0.5 0.7
│ yiru-emulator skill│
└────────────────────┘
```

Yiru owns:
- Starting/stopping the serve-sim helper (via --detach or direct).
- Per-worktree "active" emulator (like active browser tab).
- Explicit targeting with `--worktree`, `--device`, `--emulator <id>`.
- The visual live pane (renderer uses serve-sim-client for the stream).

Agents use the Yiru executable chosen above (on PATH in Yiru terminals) and never have to manage PIDs, state files in /tmp, or raw WS URLs themselves.

**For `pnpm dev` testing:** run `pnpm build:cli` first (rebuilds the CLI + ensures the `yiru-dev` shim points at *this* worktree). Then inside the dev app use `yiru-dev emulator ...` (or the direct `./config/scripts/yiru-dev.mjs emulator ...` from the repo root). The orchestration preambles and dev launchers automatically select the dev command name so the CLI reaches your in-memory EmulatorBridge / runtime. Plain `yiru` reaches a packaged install instead.

## Common operations

Use `--json` for agent-friendly output. Commands are workspace-scoped by default (current worktree's active emulator).

| Goal                        | Command                                      | Notes |
|-----------------------------|----------------------------------------------|-------|
| List available / running   | `YIRU emulator list [--worktree <sel>]`     | Shows Yiru-managed + raw serve-sim streams. Use output for explicit --device/--emulator. |
| Attach / make active       | `YIRU emulator attach "iPhone 16 Pro" [--worktree <sel>] [--focus]` | Starts helper if needed (serve-sim --detach). Sets active for unqualified commands. --focus optional (does not auto-steal UI focus by default). |
| Single tap                 | `YIRU emulator tap <x> <y> [--device <id>]` | Normalized 0..1 coords. **Preferred over gesture for simple taps.** |
| Multi-step gesture         | `YIRU emulator gesture '<json>'`            | See gestures reference (begin/move/end). Use tap for singles. |
| Type text                  | `YIRU emulator type "text" [--device <id>]` | US ASCII only. Supports stdin/file via exec if needed. |
| Hardware button            | `YIRU emulator button home [--device <id>]` | home, swipe_home, app_switcher, lock, siri, side_button. |
| Rotate device              | `YIRU emulator rotate landscape_left`       | Remembers orientation for subsequent gestures. |
| Camera injection           | `YIRU emulator camera com.acme.App --webcam` | Or --file, placeholder. Hot-swap with switch. May (re)launch app. |
| Permissions                | `YIRU emulator permissions grant camera com.acme.App` | grant/revoke/reset/list. See full subcommand help. |
| Accessibility tree         | `YIRU emulator ax [--device <id>]`          | Or via exec for raw endpoint. |
| Raw / advanced             | `YIRU emulator exec --command "tap 0.5 0.7"` | Or "ca-debug blended on", "memory-warning", full serve-sim subcommands (no "serve-sim" prefix needed in the command string). Bridge injects active device context. |
| Stop                       | `YIRU emulator kill [--device <id>]`        | Or let pane close / Yiru quit clean up. |

Most support `--worktree <selector>` and explicit `--device <udid|name>` or `--emulator <id>` (from list) for targeting.

## Critical gotchas (teach agents)

- **Prefer `tap` over `gesture` for single taps** (same as raw serve-sim). Separate gesture begin/end can be interpreted as long-press due to WS overhead. The Yiru wrapper uses the reliable quick sequence.
- All coords normalized 0..1 (top-left origin). Never pixels.
- One "active" emulator per worktree for unqualified commands (like active browser tab). Discover ids with `list`, use explicit flags for multi-device or cross-worktree.
- Type = US keyboard only. Unsupported chars error clearly.
- Camera injection often requires (re)launching the target app bundle.
- The visual pane and CLI share the same underlying stream/helper. Closing the pane can stop the stream (configurable).
- Stale helpers / state are cleaned by Yiru on quit, but agents should `kill` when done.
- Private APIs under the hood (SimulatorKit etc.) — version sensitive (Xcode updates can affect).

## Targeting devices & worktrees

- Default: current worktree's active emulator (resolved from shell cwd or Yiru context).
- Explicit worktree: `--worktree id:<fullWorktreeId>` or `--worktree active`. The full id is the exact `<repo-id>::<path>` value returned by `YIRU worktree list --json`; a bare repo id is not valid here.
- Explicit device: `--device "iPhone 16 Pro"` or `--device <udid>` (after `list`).
- Yiru-generated emulator id (for stability, like browserPageId): use `--emulator <id>` returned by list (recommended for scripts that persist ids).

`--worktree all` only for listing.

## Integration with the live pane (UI)

- Opening the emulator pane in Yiru (or `attach`) makes that stream the "active" one for the worktree → CLI commands target it automatically.
- The pane shows the real 60fps stream (device frame, touch forwarding, toolbar).
- Agents can drive via CLI while the human watches/interacts in the pane.
- No automatic focus steal on CLI attach (use `--focus` if you really want the UI to switch; matches browser behavior).
- Multiple devices: list shows them; pane can grid; CLI uses active or explicit selector.

## Cleanup

```text
YIRU emulator kill --device "iPhone 16 Pro"
```

Or let Yiru quit / close the pane.

Orphans are cleaned by Yiru (like agent-browser sessions).

## Examples (agent-friendly)

```text
YIRU status --json
YIRU emulator list --json
YIRU emulator attach "iPhone 16 Pro" --json
YIRU emulator tap 0.5 0.8 --json
YIRU emulator type "user@example.com" --json
YIRU emulator button home --json
YIRU emulator camera com.acme.MyApp --file /tmp/test.mp4 --json
YIRU emulator permissions grant camera com.acme.MyApp --json
YIRU emulator ax --json
YIRU emulator exec --command "ca-debug blended on" --json
```

After changes, re-snapshot / wait as needed (analogous to browser snapshot-interact loop).

## Next action

Confirm `YIRU status --json` and `YIRU emulator list --json`, then drive the emulator while the live view is visible in Yiru.

See also: yiru-cli skill (terminals, worktrees, built-in browser), computer-use for desktop outside the simulator.

This skill is the Yiru-native replacement for raw serve-sim when you want the visual + control integrated in the IDE.
