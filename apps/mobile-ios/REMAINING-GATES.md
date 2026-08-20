# Remaining cutover gates

**The legacy Expo tree is deleted.** `apps/mobile` no longer exists; `legacyRemovalAllowed` is
`true`; `apps/mobile-ios` is the only Yiru mobile client. Rollback is `git checkout HEAD -- apps/mobile`
against the commit that removed it — the working tree is not the rollback path, git is.

9 of 13 gates in [`cutover-readiness.json`](./cutover-readiness.json) read `verified`. This file
covers the 4 that do not. The long narrative history is in [`CUTOVER.md`](./CUTOVER.md).

None of these gates are machine-checked any more: every repository-contract script that used to
enforce them has been deleted. Treat recorded numbers as snapshots, not live guarantees.

## What the deletion was verified against

Run on 2026-08-20, after the tree was removed:

| Check | Result |
| --- | --- |
| `vp lint` (whole repo) | exit 0 |
| `pnpm typecheck` (34 tasks) | exit 0, 0 errors |
| `vp run yiru#build` | exit 0 |
| `vp run yiru-mobile-ios#lint` (strict swift-format) | 0 warning/error lines in output |
| `xcodebuild … -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` | `** BUILD SUCCEEDED **`, 0 errors |
| App install + launch on Simulator | runs, renders live paired-desktop data |
| Widget extension | loads, hosted by `chronod`, serves timeline work, no assertion |
| `apps/mobile` references repo-wide | zero outside `CUTOVER.md` / this file |
| `pnpm install --lockfile-only` | exit 0; lockfile lost 8856 lines |

## Gate 1 — `route-behavior-parity` (pending)

`migration-parity.json` records 29/29 routes and 126/126 capabilities, and 13 slice audits agreed.
**That is self-report.** Three adversarial (falsification-oriented) audits of native chat, session
terminal, and tab lifecycle were launched and all three died on an API spend limit before producing
anything, so those three areas have had checklist verification but not falsification. Earlier
adversarial passes on other areas found 3 real gaps that the checklists had missed, so the technique
demonstrably finds things here.

This gate needs those three audits re-run. It does not need a device.

## Gate 2 — `physical-device-performance` (pending, needs hardware)

An iPhone 15 Pro (`iPhone16,1`) is `available (paired)` and the Xcode CLI works (Xcode 26.6).
The blocker is provisioning: no profile exists for `com.xinyao27.yiru.mobile` or
`com.xinyao27.yiru.mobile.ExpoWidgetsTarget`. The 5 profiles on this machine all belong to an
unrelated project (`com.paperboy.pbmobile`, teams `9FDAZCRAN3`/`GAGG4898M6`). Certificates are fine —
`Apple Development` and `Apple Distribution: xinyao chen (8H6Q2YA365)` are both in the keychain.

Two ways to get a profile:

1. **Xcode GUI** — Settings → Accounts → add the Apple ID on team `8H6Q2YA365`, then build with
   `-allowProvisioningUpdates`.
2. **CLI only, no GUI** — pass the App Store Connect API key directly:
   ```sh
   xcodebuild -project YiruMobile.xcodeproj -scheme YiruMobile -configuration Debug \
     -destination 'platform=iOS,id=3FF47770-762F-59D2-85F3-41D3798EC5ED' \
     -allowProvisioningUpdates \
     -authenticationKeyPath ~/Desktop/yiru/AuthKey_4S87SAL8T4.p8 \
     -authenticationKeyID 4S87SAL8T4 \
     -authenticationKeyIssuerID <ASC_ISSUER_ID> \
     build
   ```
   The key and its ID are already on disk. Only the issuer ID is missing locally; it is the value of
   the `ASC_ISSUER_ID` GitHub secret, also visible in App Store Connect → Users and Access →
   Integrations.

What this gate actually covers — the things a Simulator cannot prove:

- SwiftTerm with a real IME (Chinese/Japanese composition) and a hardware keyboard incl. modifier chords
- VoiceOver traversal of the terminal accessory bar, the tab strip, and Source Control file rows
- a sustained terminal output flood, watching the memory curve rather than the frame rate
- real QR pairing with the camera, plus permission-denied and restricted paths
- **Local Network Privacy** — Simulator does not implement it at all
  ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)),
  so the permission prompt and its denial path are untested by definition
- Widget timeline refresh across backgrounding and a device restart, and energy impact
- notification permission prompt and real local-notification delivery

## Gates 3 and 4 — `app-store-archive`, `testflight-release` (pending)

**A blocker here was found and fixed on 2026-08-20.** `fastlane/Fastfile` called
`scripts/check-signed-archive.mjs` from both the `archive` (line 228) and `release` (line 249) lanes,
and that script had never existed in git history — both lanes would have failed after building, before
upload. It is now written and exercised: it verifies bundle ids, app/widget build-number match,
signature validity, `Apple Distribution` authority, `TeamIdentifier=8H6Q2YA365`,
`aps-environment: production`, and the `group.com.xinyao27.yiru.mobile` app group on both the app and
the embedded widget.

All six secrets the lanes read are configured (`gh secret list`, added 2026-07-18):
`APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8`, `IOS_DIST_CERT_P12`,
`IOS_DIST_CERT_PASSWORD`.

What is left is triggering the lanes:

- `.github/workflows/mobile-ios-native-archive.yml` — signed archive
- `.github/workflows/mobile-ios-native-release.yml` — TestFlight upload

The legacy `mobile-ios-release.yml` (which despite its name built the Expo app) and `mobile.yml` are
both deleted, so there is no longer a same-named workflow to confuse these with, and no tag collision:
native releases fire on `mobile-ios-native-v*`.

One cosmetic leftover, deliberately not changed: the widget bundle id is still
`com.xinyao27.yiru.mobile.ExpoWidgetsTarget`. It is a live App Store Connect identifier; renaming it
requires an identifier migration and must not be bundled into a release.
