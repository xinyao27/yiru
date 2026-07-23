# Yiru Mobile

React Native companion app for Yiru. Monitor worktrees, view terminal output, and send commands from your phone.

Local development uses two processes:

- Yiru desktop/Electron from the repo root. This hosts the mobile WebSocket RPC server on port `6768`.
- Expo Metro from `apps/mobile/`. This serves the React Native app on port `8081`.

Unless a command says otherwise, run mobile app commands from the `apps/mobile/` directory.

## Prerequisites

- Node.js 24+
- pnpm
- Xcode and/or Android Studio tooling for simulator or device builds
- Expo Go on your phone, or a development client build when native modules are needed
- Phone and desktop on the same LAN when testing a physical phone

## Start Desktop Yiru

From the repository root:

```bash
pnpm install
pnpm dev
```

Confirm the mobile RPC server is listening:

```bash
lsof -nP -iTCP:6768 -sTCP:LISTEN
```

Restart `pnpm dev` after changing Electron main-process code. Metro hot reload only applies to the mobile JavaScript bundle.

## Start The Mobile App

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

## Pair With Desktop Yiru

1. Open Yiru desktop.
2. Go to Settings > Mobile.
3. Scan the pairing QR code from the mobile app.
4. Confirm the mobile host endpoint is `ws://<desktop-ip>:6768`.

For the Android emulator, use `ws://10.0.2.2:6768`. For a physical phone, use the desktop LAN IP, for example `ws://192.168.0.179:6768`.

If the phone has a stale host entry, remove it from the app and pair again.

## Development Paths

### Android Phone

1. Install Expo Go from Google Play
2. Run `pnpm start`, scan QR with Expo Go
3. For native modules: `pnpm exec expo run:android`
4. Run with `pnpm start --dev-client`

### iOS Simulator

1. Install Xcode from the App Store
2. Run `pnpm start --ios` to open in iOS Simulator

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
└── assets/                # App icons and splash screen
```
