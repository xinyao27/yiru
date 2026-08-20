# Android retirement

The native client target is iOS 26 only. Android is not a supported target for the native
rewrite, so the repository no longer has an Android release workflow or an Android target in
`apps/mobile-ios/project.yml`.

The legacy Expo source under `apps/mobile` remains temporarily available for the reversible
cutover period and is intentionally not modified by this retirement. Its historical Android
source and scripts are not a release path for the native iOS client.

`scripts/check-android-retirement.mjs` is part of the native cutover verification lane so a new
Android release workflow or native Android build target cannot be added accidentally without
making the retirement decision explicit.
