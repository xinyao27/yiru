import {
  YIRU_GITHUB_ISSUES_URL,
  YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL,
  YIRU_GITHUB_RELEASES_URL,
  YIRU_GITHUB_REPOSITORY_URL,
  YIRU_IOS_TESTFLIGHT_URL
} from '@yiru/workbench-model/product'

// Why: these URLs are canonical in @yiru/workbench-model — the desktop and
// mobile apps open the very same constants. Retyping them here is how a site
// ends up pointing somewhere the product no longer does.
export const siteLinks = {
  // Why: these artifact names are version-free and fixed by the release
  // contract in apps/desktop/scripts/verify-release-required-assets.mjs, so
  // /releases/latest/download/<name> is a permalink to the current build —
  // no metadata fetch, and one click instead of picking from 17 assets.
  // Linux and Windows names live in that same contract when they are offered.
  downloadMac: `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-macos-arm64.dmg`,
  downloadMacIntel: `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-macos-x64.dmg`,
  github: YIRU_GITHUB_REPOSITORY_URL,
  releases: YIRU_GITHUB_RELEASES_URL,
  issues: YIRU_GITHUB_ISSUES_URL,
  license: `${YIRU_GITHUB_REPOSITORY_URL}/blob/main/LICENSE`,
  testflight: YIRU_IOS_TESTFLIGHT_URL
} as const
