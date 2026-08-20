# iOS release

The GitHub Actions workflow [mobile-ios-release.yml](../../.github/workflows/mobile-ios-release.yml)
builds the native SwiftUI app, signs the app and widget, verifies the resulting archive, and uploads
the IPA to TestFlight.

## Existing App Store identity

Every release must target the existing Yiru app. Fastlane fails closed when App Store Connect does
not return this exact pair:

- Bundle ID: `com.xinyao27.yiru.mobile`
- Apple ID: `6792278376`

The widget keeps `com.xinyao27.yiru.mobile.ExpoWidgetsTarget` because that extension identifier is
already registered on the existing app. It is an App Store identity, not a build dependency.

## GitHub Actions inputs

The manual workflow preserves the previous iOS release interface:

- `bump_patch_version`: increment the patch component of the highest version already known to the
  existing App Store record or the project.
- `release_version`: use an exact `x.y.z` marketing version instead.
- `testflight_distribution`: upload for `internal` or `external` testers.
- `testflight_changelog`: release notes used for external TestFlight distribution.

Pushing a `mobile-ios-v*` tag runs the same lane with internal distribution. Unless an exact version
is supplied, Fastlane resolves the highest marketing version from the existing app's App Store and
TestFlight history, together with the project version. The build number is the highest integer build
number in that TestFlight history plus one, including builds produced by the former Expo client.

If the resolved marketing-version train is already closed, the workflow stops before compiling.
Dispatch it again with `bump_patch_version`, or provide an exact higher `release_version`.

## Required secrets

- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_API_KEY_P8`
- `IOS_DIST_CERT_P12`
- `IOS_DIST_CERT_PASSWORD`

The workflow validates all six values before dependency installation or compilation. Fastlane then
checks the App Store identity and version train before creating the signed archive.

## App Store publication

The workflow uploads to TestFlight; it does not submit a version for App Review. After Apple finishes
processing the build, App Store Connect still requires selecting that build on the existing app
version, completing compliance and metadata, and submitting it for review.

One-shot storage migration code remains in the app so an installed legacy build can upgrade without
losing hosts, credentials, settings, or widget data. Those compatibility keys must remain stable
through the supported upgrade window even though no legacy source or build tool remains in the repo.
