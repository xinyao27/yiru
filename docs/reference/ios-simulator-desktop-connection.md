# Connecting Yiru for iOS to Yiru Desktop

Applies to the native SwiftUI app in [`apps/mobile-ios`](../../apps/mobile-ios). Mobile reaches the
desktop over the same authenticated oRPC-over-WebSocket runtime transport the renderer uses; nothing
about pairing is mobile-specific except how the endpoint and token get onto the device.

## Short answer

Run the one-command development flow:

```sh
vp run yiru-mobile-ios#dev
```

It builds the app, boots a Simulator, installs and launches it, and starts (or reuses) a development
desktop runtime, then hands the app a pairing deep link. See
[`apps/mobile-ios/scripts/start-development.mjs`](../../apps/mobile-ios/scripts/start-development.mjs).

To pair against the **visible** desktop app instead of a development runtime, generate a pairing
offer in Desktop and open its `yiru://` link in the Simulator:

```sh
xcrun simctl openurl booted 'yiru://…'
```

The `yiru` scheme is registered in
[`apps/mobile-ios/project.yml`](../../apps/mobile-ios/project.yml) under `CFBundleURLSchemes`.

## What is actually connecting

| Piece | Where it lives |
| --- | --- |
| Deep-link / QR payload decoding | `YiruMobile/Features/Pairing/PairingCodeDecoder.swift` |
| Pairing offer model | `YiruMobile/Features/Pairing/PairingOffer.swift` |
| Scan and confirm screens | `YiruMobile/Features/Pairing/PairingScanView.swift`, `PairingConfirmView.swift` |
| Endpoint construction | `YiruMobile/Features/Hosts/Endpoint.swift` |
| Host profile persistence (Keychain) | `YiruMobile/Platform/Persistence/KeychainHostRepository.swift` |
| Authenticated socket | `YiruMobile/Platform/Runtime/AuthenticatedRuntimeConnection.swift` |
| Desktop WebSocket listener and port selection | `apps/desktop/src/main/runtime/rpc/ws-transport.ts` |

A paired host stores one WebSocket endpoint plus its credential. Changing the desktop's address or
port means editing the host or pairing again — the app does not rediscover it.

## Address and port rules

| Situation | Endpoint to advertise | Port behavior |
| --- | --- | --- |
| Simulator on the same Mac | `127.0.0.1` | Use the port printed under the QR |
| Physical iPhone on the same LAN | Mac LAN IPv4, e.g. `192.168.1.50` | Packaged preference is `6768`, but use the printed port |
| Tailscale / private overlay | Reachable `100.x.y.z` or private hostname | Use the printed or explicitly configured port |
| Development desktop | Same address rules | Preferred port is `6769` |

**Always use the printed port.** After a preferred-port collision the desktop persists the fallback
and binds that fallback *first* on later starts, specifically so already-paired devices are not
stranded on an endpoint nobody is listening to (see the `Why:` comment on candidate ordering in
`ws-transport.ts`). Assuming `6768`/`6769` is the single most common cause of a pairing that
"worked yesterday".

For a real phone, never advertise `127.0.0.1` — loopback means the phone itself. Apple's definition:
[`IPv4Address.loopback`](https://developer.apple.com/documentation/network/ipv4address/loopback).

## iOS network policy in this repository

[`apps/mobile-ios/project.yml`](../../apps/mobile-ios/project.yml) already declares:

- `NSLocalNetworkUsageDescription` — "Yiru connects to the desktop app on your local network."
- `NSAppTransportSecurity` → `NSAllowsLocalNetworking: true`
- `NSCameraUsageDescription`, covering the pairing-code scanner
- the `yiru` custom scheme used by pairing deep links

Apple treats Local Network Privacy and App Transport Security as **different** controls:

- Direct local unicast connections need `NSLocalNetworkUsageDescription`:
  [property-list documentation](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription).
- `NSAllowsLocalNetworking` covers unqualified domains, `.local` names, and local IP addresses for
  ATS purposes:
  [`NSAllowsLocalNetworking`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).
- **Simulator does not implement Local Network Privacy**, so it cannot validate the real-device
  permission prompt or its denial path:
  [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

A successful Simulator connection therefore verifies endpoint reachability, WebSocket auth, E2EE, and
UI behavior. It does **not** prove that Local Network permission copy and denial behavior work on a
physical iPhone. That check belongs to the physical-device pass.

## Common failures

### `simctl openurl` says it cannot open `yiru://…`
The app is not installed on that Simulator, or a stale build with a different bundle id is. Reinstall
via the development flow; `start-development.mjs` also uninstalls known conflicting bundle ids.

### The QR or link says `ws://0.0.0.0:…`
`0.0.0.0` is a bind address, not a destination. Re-generate the offer once the desktop has resolved a
concrete address, or edit the host to the Mac's real LAN IPv4.

### It tries `6768`/`6769` but nothing listens there
A persisted port fallback is in effect. Use the port the desktop actually printed.

### WebSocket connect timeout
Reachability, not auth. From the Mac: `nc -z <host> <port>`. On a real device, confirm both are on the
same network and that Local Network permission was granted.

### Authentication failed
The stored credential no longer matches the desktop's. Pair again; do not hand-edit the endpoint.

### Pairing stays on "Connecting…"
Check the desktop side is a *running* runtime, not just a launched app window, and that the message
size limit is not being hit — `AuthenticatedRuntimeConnection.swift` raises
`URLSessionWebSocketTask.maximumMessageSize` above the 1 MiB default precisely because large
payloads otherwise fail with `NSPOSIXErrorDomain Code=40 "Message too long"`.

### A previously working host no longer connects
Almost always a changed desktop port or LAN address. Re-pair rather than debugging the socket.
