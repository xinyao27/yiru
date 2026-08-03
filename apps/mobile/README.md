# Yiru Mobile

React Native companion app for Yiru. Monitor worktrees, view terminal output, and send commands from your phone.

The binding UI and component architecture is in [`DESIGN.md`](./DESIGN.md). Standard native
controls use `@expo/ui` directly by default; shared mobile modules are reserved for repeated product
behavior and real platform policy, not one-to-one wrappers around Expo controls.

Local development uses two cooperating processes:

- Yiru desktop/Electron. This hosts the mobile WebSocket RPC server.
- Expo Metro from `apps/mobile/`. This serves the React Native app on port `8081`.

On macOS, the root development command starts both and automatically pairs an iOS Simulator with
the visible development desktop. The desktop port is discovered at runtime because development and
fallback ports are not always `6768`.

## Prerequisites

- Node.js 24+
- pnpm
- Xcode and/or Android Studio tooling for simulator or device builds
- Expo Go on your phone, or a development client build when native modules are needed
- Phone and desktop on the same LAN when testing a physical phone

## Start Desktop And iOS Simulator

From the repository root:

```bash
pnpm install
pnpm dev
```

The mobile development process waits for Desktop, boots the default iOS Simulator, installs the
native development client if it is missing, starts Metro, opens the app, and confirms the pairing
prompt through a development-only loopback path. Repeated starts reuse the same simulator credential
instead of adding another paired device.

The first run can take longer because Xcode must build the native development client. Later runs use
the installed client and Metro Fast Refresh.

To start Desktop plus plain Metro without booting or pairing a simulator:

```bash
YIRU_MOBILE_AUTO_PAIR=0 pnpm dev
```

Restart `pnpm dev` after changing Electron main-process code. Metro hot reload only applies to the mobile JavaScript bundle.

## Start Only The Mobile App

```bash
cd apps/mobile
pnpm install
pnpm start
```

Scan the Expo QR code with your phone's camera on iOS, or Expo Go on Android.

For a native dev-client build:

```bash
pnpm exec expo run:android
pnpm exec expo run:ios
pnpm start --dev-client
```

## UI Lab Without Pairing

After installing the native dev client once, launch the development-only UI Lab with:

```bash
pnpm start:ui
```

This boots the iOS Simulator, starts Metro, skips the desktop pairing runtime, and opens a fixture
selector. Every fixture navigates through the production session route; only its RPC responses are
mocked. Composer sends are echoed locally and do not reach a runtime. Use `pnpm start:emulator` when
the UI needs real host or worktree data.

## Pair With Desktop Yiru

`pnpm dev` performs these steps automatically for the iOS Simulator. For a physical phone, Android
emulator, or manual fallback:

1. Open Yiru desktop.
2. Go to Settings > Mobile.
3. Scan the pairing QR code from the mobile app.
4. Confirm the mobile host endpoint shown by Desktop.

For the Android emulator, replace the host in Desktop's endpoint with `10.0.2.2` and keep its
actual port. For a physical phone, replace the host with the desktop LAN IP and likewise keep the
displayed port.

If the phone has a stale host entry, remove it from the app and pair again.

## Development Paths

### Android Phone

1. Install Expo Go from Google Play
2. Run `pnpm start`, scan QR with Expo Go
3. For native modules: `pnpm exec expo run:android`
4. Run with `pnpm start --dev-client`

### iOS Simulator

1. Install Xcode from the App Store
2. Run `pnpm dev` from the repository root for automatic Desktop pairing
3. Run `pnpm start --ios` from `apps/mobile` when only Metro and the simulator are needed

## Physical Phone Debugging

The phone can be inspected through the connected device tooling:

```bash
yiru snapshot --json
yiru click --element @e3 --json
yiru fill --element @e1 --value "ls" --json
yiru screenshot --json
```

Use `snapshot` first to find the current element refs, then click/fill those refs. After mobile file edits, Metro usually hot reloads automatically, but navigating out of and back into the session screen can be useful because it re-runs `terminal.subscribe`.

## Validation

Run these checks before committing mobile terminal changes:

```bash
cd apps/mobile
pnpm exec tsc --noEmit
pnpm lint
cd ..
pnpm typecheck:node
```

## Protocol Version Compatibility

Mobile and desktop talk over a versioned protocol. Because mobile and desktop builds can ship on different schedules, both sides exchange version numbers on `status.get` so a genuinely incompatible combo can hard-block instead of silently misbehaving.

The canonical constants and compatibility evaluator live in
`packages/runtime-protocol/src/`. Desktop, CLI, and mobile consume the same
package contract so version gates cannot drift between independently shipped
clients.

### When to bump

Bump `RUNTIME_PROTOCOL_VERSION` for **breaking** changes:

- Removed RPC method or required parameter that mobile uses
- Changed meaning (units, nullability) of an existing field mobile reads
- Changed encryption, framing, or auth handshake

Do **not** bump for additive changes:

- New RPC methods
- New optional fields on existing methods
- New event types in `terminal.subscribe`

Set `MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION` when a server must reject older
clients. Set `MIN_COMPATIBLE_RUNTIME_SERVER_VERSION` when clients require a
newer server.

When a verdict is `blocked`, `apps/mobile/src/components/protocol-block-screen.tsx` points mobile updates to TestFlight or the rolling Android APK and desktop updates to GitHub Releases.

To exercise the block screen locally, temporarily set
`MIN_COMPATIBLE_RUNTIME_SERVER_VERSION = 999` in the canonical package,
rebuild, and pair to any desktop. Revert before merging.

## Connecting to Real Yiru

1. Start Yiru desktop with WebSocket transport enabled
2. In Yiru, go to Settings > Mobile and scan the QR code with this app
3. The QR encodes the connection endpoint, device token, and TLS fingerprint

## Project Structure

```
apps/mobile/
├── app/                   # Expo Router screens (file-based routing)
│   ├── _layout.tsx        # Root layout with navigation stack
│   ├── index.tsx          # Home screen — paired hosts list
│   └── pair-scan.tsx      # QR code scanning screen
├── src/
│   ├── terminal/          # Terminal WebView and xterm bridge
│   └── transport/         # WebSocket RPC client
└── assets/                # App icons and other bundled images
```
