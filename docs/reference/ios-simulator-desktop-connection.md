# Connecting Yiru in iOS Simulator to Yiru Desktop

## Short answer

On macOS, run this from the repository root:

```bash
pnpm dev
```

The mobile development process waits for the visible development Desktop, boots the default iOS
Simulator, builds the native development client when it is missing, starts Metro, opens the app, and
pairs it over `127.0.0.1`. The pairing credential is obtained through Desktop's authenticated local
CLI socket and is never printed by the orchestration script.

To opt out and run Desktop plus plain Metro:

```bash
YIRU_MOBILE_AUTO_PAIR=0 pnpm dev
```

For a manual fallback:

1. Build and open the Yiru mobile development client in iOS Simulator.
2. In Yiru Desktop, open **Settings → Mobile**.
3. Under **Local connection settings**, choose **Add custom address…** and enter
   `127.0.0.1`.
4. Generate the pairing QR, then copy the pairing code shown below it.
5. Deliver that code to the simulator with a deep link, then tap **Pair**:

   ```bash
   pairing_url="$(pbpaste)"
   xcrun simctl openurl booted "$pairing_url"
   unset pairing_url
   ```

The important detail is to trust the endpoint printed under the desktop QR. `6768` is only the
packaged app's preferred port; development and fallback cases use other ports.

The pairing URL contains a device credential. Do not paste it into chat, logs, issue reports, or a
literal shell command that will be retained in shell history.

## How the automatic development flow works

The workspace `dev` command runs Desktop and Mobile in parallel. On macOS, Mobile:

1. Finds an available iOS Simulator.
2. Polls the local `yiru-dev mobile development-pairing` command until Desktop is ready.
3. Requests a loopback pairing offer for a stable simulator device name. Desktop reuses that named
   credential on later starts.
4. Boots the simulator with `simctl`, installing the native development client only when absent.
5. Starts Metro, opens the development-client URL, and delivers the pairing deep link twice. The
   development client auto-confirms only when its explicit dev flag is enabled and the offer points
   to `127.0.0.1`.

The development pairing RPC is accepted only on Desktop's local Unix socket or Windows named pipe,
requires the existing per-user runtime auth token, and is disabled outside development builds. It is
not registered on the mobile WebSocket dispatcher.

`pnpm start:emulator` keeps its original behavior: it creates an isolated headless runtime for
mobile-only work. Use `pnpm dev` when the simulator should see the same hosts and worktrees as the
visible Desktop window.

## What is actually connecting

Metro and Yiru Desktop are separate services:

- Metro serves the React Native bundle, normally from port `8081`. It is only the mobile development
  server.
- Yiru Desktop hosts a WebSocket RPC server. Its preferred packaged-app port is `6768`; a normal
  development desktop prefers `6769`. The WebSocket server binds IPv4 `0.0.0.0`, so it accepts both
  loopback and LAN connections. `0.0.0.0` is a listen address, not an address a client should save or
  dial.
- The mobile app connects directly to the endpoint embedded in the pairing offer, authenticates with
  the embedded per-device token, completes an application-level E2EE handshake, and only then saves
  the host profile. The token is stored in native secure storage.

Sources:

- Metro and desktop are the two development processes:
  [`apps/mobile/README.md:5-8`](../../apps/mobile/README.md#L5-L8).
- Default WebSocket port and all-interface bind:
  [`apps/desktop/src/main/runtime/rpc.ts:39-52`](../../apps/desktop/src/main/runtime/rpc.ts#L39-L52),
  [`apps/desktop/src/main/runtime/rpc.ts:468-528`](../../apps/desktop/src/main/runtime/rpc.ts#L468-L528).
- Development desktop port `6769` and fallback behavior:
  [`apps/desktop/src/main/index.ts:2416-2455`](../../apps/desktop/src/main/index.ts#L2416-L2455),
  [`apps/desktop/src/main/runtime/rpc/ws-transport.ts:148-193`](../../apps/desktop/src/main/runtime/rpc/ws-transport.ts#L148-L193).
- Pairing-offer fields:
  [`packages/mobile-relay-protocol/src/mobile-relay-pairing-offer.ts:34-89`](../../packages/mobile-relay-protocol/src/mobile-relay-pairing-offer.ts#L34-L89).
- Direct connection and save-after-connect behavior:
  [`apps/mobile/src/transport/pre-profile-pairing-coordinator.ts:64-108`](../../apps/mobile/src/transport/pre-profile-pairing-coordinator.ts#L64-L108).
- Secure token storage:
  [`apps/mobile/src/transport/host-store.ts:21-67`](../../apps/mobile/src/transport/host-store.ts#L21-L67),
  [`apps/mobile/src/transport/host-store.ts:211-256`](../../apps/mobile/src/transport/host-store.ts#L211-L256).
- Plain `ws://` is protected with per-device auth and application-layer encryption:
  [`apps/desktop/src/main/runtime/rpc.ts:468-470`](../../apps/desktop/src/main/runtime/rpc.ts#L468-L470),
  [`apps/desktop/src/main/runtime/e2ee-keypair.ts:1-3`](../../apps/desktop/src/main/runtime/e2ee-keypair.ts#L1-L3).

## Path A: pair the simulator with the visible desktop app

This is the right path when the goal is to see and control the same hosts, worktrees, and terminals
shown in the desktop window.

### 1. Install or start the mobile development client

The first native build installs the Yiru-specific development client and its custom URL scheme:

```bash
cd apps/mobile
pnpm ios
```

For later runs, start Metro and open the already-installed app:

```bash
cd apps/mobile
pnpm start --ios
```

Or use the repository's simulator orchestration while explicitly preventing it from creating a
different temporary desktop runtime:

```bash
cd apps/mobile
pnpm start:emulator --no-pair
```

Use `--no-pair` whenever the visible, already-running desktop app is the intended target. Without it,
`start:emulator` pairs the mobile app to its own isolated headless runtime instead.

`pnpm ios` maps to `expo run:ios`, while the start wrapper forwards arguments to `expo start`:
[`apps/mobile/package.json:23-40`](../../apps/mobile/package.json#L23-L40),
[`apps/mobile/scripts/start-expo.mjs:42-45`](../../apps/mobile/scripts/start-expo.mjs#L42-L45). Expo's
current iOS Simulator guide also documents `npx expo start --ios`:
[Expo, “iOS Simulator”](https://docs.expo.dev/workflow/ios-simulator/).

If native dependencies or `app.json` changed, rebuild with `pnpm ios`; Metro Fast Refresh cannot
change the installed native binary.

### 2. Generate a simulator-reachable pairing offer

In the desktop app:

1. Open **Settings → Mobile**.
2. Under **Local connection settings**, select **Add custom address…**.
3. Enter `127.0.0.1`.
4. Click **Generate QR Code**.
5. Verify that the endpoint printed under the QR begins with `ws://127.0.0.1:` and copy the pairing
   code shown below it.

The UI supports manually advertising an IPv4 address or hostname, optionally with a port:
[`packages/client/src/components/mobile/network-interface-picker.tsx:8-14`](../../packages/client/src/components/mobile/network-interface-picker.tsx#L8-L14),
[`apps/desktop/src/shared/network/manual-address.ts:21-58`](../../apps/desktop/src/shared/network/manual-address.ts#L21-L58).
Generating the QR uses the chosen address but preserves the server's actual bound port:
[`apps/desktop/src/main/ipc/mobile.ts`](../../apps/desktop/src/main/ipc/mobile.ts),
[`apps/desktop/src/main/runtime/rpc.ts:64-81`](../../apps/desktop/src/main/runtime/rpc.ts#L64-L81).

Apple's archived Xcode 7 release notes explicitly say that a simulated app reaches TCP/IP services
on the Mac through `localhost` or `127.0.0.1`. This is old documentation, but current Expo examples
still use a simulator with a Mac-hosted `localhost:8081` origin, so the loopback behavior remains an
appropriate development assumption:
[Apple Xcode 7 release notes](https://developer.apple.com/library/archive/documentation/Xcode/Conceptual/RN-Xcode-Archive/Chapters/xc7_release_notes.html),
[Expo API-routes local testing](https://docs.expo.dev/router/web/api-routes/).

Prefer `127.0.0.1` over `localhost` here because the Yiru WebSocket listener is explicitly IPv4;
`localhost` can resolve to IPv6 `::1` first on some configurations.

### 3. Open the pairing deep link in Simulator

After copying the desktop pairing code:

```bash
pairing_url="$(pbpaste)"
xcrun simctl openurl booted "$pairing_url"
unset pairing_url
```

The app routes `yiru://pair?code=…` cold- and warm-start links to a confirmation screen:
[`apps/mobile/app/_layout.tsx:103-127`](../../apps/mobile/app/_layout.tsx#L103-L127). Tap **Pair**. The
confirmation flow limits the initial attempt to 25 seconds and shows a connection log if it stalls:
[`apps/mobile/app/pair-confirm.tsx:21-28`](../../apps/mobile/app/pair-confirm.tsx#L21-L28),
[`apps/mobile/app/pair-confirm.tsx:81-147`](../../apps/mobile/app/pair-confirm.tsx#L81-L147).

An entirely UI-driven alternative is:

```bash
pbpaste | xcrun simctl pbcopy booted
```

Then tap **Pair Desktop → Or paste pairing code** in the mobile app and paste. The simulator does not
need to use a camera for this flow. The scan screen accepts either the whole `yiru://` URL or its bare
base64url code:
[`apps/mobile/app/pair-scan.tsx:92-108`](../../apps/mobile/app/pair-scan.tsx#L92-L108),
[`apps/mobile/src/transport/pairing.ts:50-73`](../../apps/mobile/src/transport/pairing.ts#L50-L73).

### 4. Confirm the connection

A successful pair returns to the host screen and saves a host only after the authenticated WebSocket
reaches `connected`:
[`apps/mobile/src/transport/pre-profile-pairing-coordinator.ts:74-88`](../../apps/mobile/src/transport/pre-profile-pairing-coordinator.ts#L74-L88).
The desktop's **Settings → Mobile** device list excludes never-connected pending QR credentials, so a
new row there is also evidence that the simulator completed its first connection:
[`apps/desktop/src/main/ipc/mobile.ts`](../../apps/desktop/src/main/ipc/mobile.ts).

## Path B: one-command mobile-development runtime

For mobile UI development, the repository already has a more automated path:

```bash
cd apps/mobile
pnpm start:emulator
```

It:

1. Starts a temporary headless Yiru runtime with an isolated profile.
2. Registers the current worktree in that runtime.
3. Finds and boots/attaches an iOS Simulator.
4. Starts Metro on the first free port from `8081` with LAN hosting.
5. Opens the development-client URL.
6. Opens the Yiru pairing deep link twice, then taps the on-screen **Pair** button.
7. Keeps the temporary runtime and Metro alive until `Ctrl+C`.

Sources:

- Public script and options:
  [`apps/mobile/package.json:38-40`](../../apps/mobile/package.json#L38-L40),
  [`apps/mobile/scripts/emulator/start.mjs:1-18`](../../apps/mobile/scripts/emulator/start.mjs#L1-L18).
- Temporary isolated runtime and mobile-scoped pairing offer:
  [`apps/mobile/scripts/emulator/pairing-runtime.mjs:12-41`](../../apps/mobile/scripts/emulator/pairing-runtime.mjs#L12-L41).
- Metro LAN startup:
  [`apps/mobile/scripts/emulator/start.mjs:368-498`](../../apps/mobile/scripts/emulator/start.mjs#L368-L498).
- Deep-link delivery and trust confirmation:
  [`apps/mobile/scripts/emulator/start.mjs:502-539`](../../apps/mobile/scripts/emulator/start.mjs#L502-L539).
- Whole orchestration and cleanup:
  [`apps/mobile/scripts/emulator/start.mjs:584-705`](../../apps/mobile/scripts/emulator/start.mjs#L584-L705).

This path does **not** pair with the profile of the visible desktop window. It intentionally creates a
temporary headless desktop runtime and stops that process when the command exits; the temporary
profile directory itself is not deleted by this script. Use Path A when the existing desktop app is
the target, or run `pnpm start:emulator --no-pair` and then complete Path A's desktop-generated
deep-link steps.

Useful variants:

```bash
pnpm start:emulator --device "iPhone 17 Pro"
pnpm start:emulator --no-pair
pnpm start:ui
```

`--no-pair` opens the app without creating the temporary runtime. `start:ui` opens fixture-backed UI
Lab and does not connect to real host/worktree data.

## Address and port rules

| Situation | Endpoint to advertise | Port behavior |
| --- | --- | --- |
| iOS Simulator on the same Mac | `127.0.0.1` | Use the port printed under the QR |
| Physical iPhone on the same LAN | Mac LAN IPv4, for example `192.168.1.50` | Packaged preference is `6768`, but use the printed port |
| Tailscale/private overlay | Reachable `100.x.y.z` or custom private hostname | Use the printed or explicitly configured port |
| Development desktop | Same address rules | Preferred port is `6769` |
| `pnpm start:emulator` temporary runtime | Generated automatically | Isolated runtime requests an OS-assigned port |

Why the printed port matters: after any preferred-port collision, Yiru persists the fallback and tries
that fallback first on subsequent starts so existing pairings keep working:
[`apps/desktop/src/main/runtime/rpc/ws-transport.ts:153-193`](../../apps/desktop/src/main/runtime/rpc/ws-transport.ts#L153-L193).
The mobile profile stores one fixed WebSocket endpoint until the user edits the host or pairs again:
[`apps/mobile/src/transport/host-endpoint.ts:1-4`](../../apps/mobile/src/transport/host-endpoint.ts#L1-L4).

For a real phone, do not use `127.0.0.1`: loopback means the phone itself. Use the desktop's LAN or
private-network address. Apple's IPv4 loopback definition is documented at
[Apple `IPv4Address.loopback`](https://developer.apple.com/documentation/network/ipv4address/loopback).

## iOS network policy in this repository

The current app config already includes:

- `NSLocalNetworkUsageDescription`, explaining that Yiru connects to the desktop app.
- `NSAllowsLocalNetworking: true` under App Transport Security.
- The `yiru` custom scheme used by pairing deep links.

See [`apps/mobile/app.json:9-31`](../../apps/mobile/app.json#L9-L31).

Apple treats Local Network Privacy and App Transport Security as different controls:

- Apps making direct local unicast connections should provide `NSLocalNetworkUsageDescription`:
  [Apple property-list documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription).
- `NSAllowsLocalNetworking` covers unqualified domains, `.local` names, and local IP addresses for
  ATS purposes:
  [Apple `NSAllowsLocalNetworking`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).
- Simulator does not implement Local Network Privacy, so it cannot validate the real-device permission
  prompt or denial behavior:
  [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

Therefore a successful simulator connection verifies endpoint reachability, WebSocket auth, E2EE, and
mobile UI behavior. It does not prove that Local Network permission copy and behavior work correctly on
a physical iPhone.

## Verification sequence

Use this order so transport, authentication, and app behavior are not conflated.

1. Confirm the desktop runtime is alive:

   ```bash
   yiru status --json
   ```

   Look for `runtime.state: "ready"` and `runtime.reachable: true`.

2. Read the exact `ws://127.0.0.1:<port>` endpoint below the desktop QR. Confirm its port is listening:

   ```bash
   lsof -nP -iTCP:<port> -sTCP:LISTEN
   ```

3. Open the pairing deep link with `simctl`, tap **Pair**, and watch the on-screen pairing log. The
   client distinguishes “Opening WebSocket”, connect timeout, WebSocket open, and the E2EE handshake:
   [`apps/mobile/src/transport/rpc-client.ts:322-420`](../../apps/mobile/src/transport/rpc-client.ts#L322-L420).

4. After pairing, open mobile **Settings → Troubleshooting → Run diagnostics**. It opens a WebSocket
   probe with a four-second deadline and reports the exact saved host as reachable or unreachable:
   [`apps/mobile/app/troubleshoot.tsx:75-169`](../../apps/mobile/app/troubleshoot.tsx#L75-L169),
   [`apps/mobile/src/diagnostics/host-reachability.ts:3-50`](../../apps/mobile/src/diagnostics/host-reachability.ts#L3-L50).

5. Check that the simulator appears in desktop **Settings → Mobile → Paired devices**.

## Common failures

### `simctl openurl` says it cannot open `yiru://…`

The Yiru development client is not installed, the simulator is not booted, or the custom scheme is not
present in the installed native build. Run `pnpm ios`, wait for the app to open, then retry.

### The QR says `ws://0.0.0.0:…`

Do not pair with that endpoint. `0.0.0.0` is the server bind address. Generate the offer from desktop
**Settings → Mobile** with custom address `127.0.0.1` for the simulator.

### The connection tries `6768` but nothing listens there

Do not assume the README's preferred port is the active port. The development desktop prefers `6769`,
and both packaged and development profiles can retain another fallback. Regenerate the QR and use the
endpoint it prints.

### WebSocket connect timeout

This is an endpoint/routing/listener problem, before authentication. Recheck the exact port with
`lsof`, prefer `127.0.0.1` over `localhost`, and restart the target desktop instance if its WebSocket
transport is absent. If using a LAN address instead of loopback, also check the macOS firewall.

### Authentication failed

The endpoint was reachable, but the device token or pinned desktop public key was rejected. The code
may be stale, the device may have been revoked, or it may belong to another desktop profile. Regenerate
the QR and pair again. A regenerated QR intentionally rotates the pending credential:
[`apps/desktop/src/main/ipc/mobile.ts`](../../apps/desktop/src/main/ipc/mobile.ts),
[`packages/client/src/components/settings/mobile/pane.tsx:86-104`](../../packages/client/src/components/settings/mobile/pane.tsx#L86-L104).

### Pairing remains on “Connecting…”

Wait for the 25-second pairing deadline and read the on-screen log. A 12-second “WebSocket connect
timeout” points to reachability; a five-second handshake timeout points to auth/E2EE after TCP/WS has
opened:
[`apps/mobile/src/transport/rpc-client.ts:133-135`](../../apps/mobile/src/transport/rpc-client.ts#L133-L135),
[`apps/mobile/src/transport/rpc-client.ts:368-420`](../../apps/mobile/src/transport/rpc-client.ts#L368-L420).

### A previously working host no longer connects

The mobile app stores the full endpoint, including its port. If the target desktop profile or endpoint
changed, remove the stale host and pair again, or edit the host endpoint in mobile. The repository's
mobile README also recommends removing stale host entries before re-pairing:
[`apps/mobile/README.md:68-77`](../../apps/mobile/README.md#L68-L77).

## Observation from this workstation

During this investigation on 2026-08-03:

- `/Applications/Yiru.app` was already running and `yiru status --json` reported a ready, reachable
  runtime.
- The packaged profile's persisted WebSocket fallback was `53213`, and the Yiru process was listening
  on `*:53213`; neither `6768` nor `6769` was the active mobile WebSocket port.
- An available `iPhone 17 Pro` simulator existed but was shut down.

These are volatile observations, not product defaults. For the current running desktop, the expected
simulator endpoint is therefore `ws://127.0.0.1:53213` **if** the pairing offer is generated with custom
address `127.0.0.1`. The desktop QR remains the authority.
