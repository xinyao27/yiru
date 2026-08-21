import {
  YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL,
  YIRU_GITHUB_RELEASES_URL
} from '@yiru/workbench-model/product'

// Why: these artifact names carry no version, so /releases/latest/download is a
// permalink to the current build — one link, no release metadata fetch. The
// .deb/.rpm names embed the version and cannot be linked this way, which is why
// packaged installs route through the release listing instead.
export const MACOS_ARM64_DOWNLOAD_URL = `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-macos-arm64.dmg`
export const MACOS_X64_DOWNLOAD_URL = `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-macos-x64.dmg`
export const LINUX_X64_DOWNLOAD_URL = `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-linux.AppImage`
export const LINUX_ARM64_DOWNLOAD_URL = `${YIRU_GITHUB_LATEST_RELEASE_DOWNLOAD_URL}/yiru-linux-arm64.AppImage`
export const ALL_DOWNLOADS_URL = YIRU_GITHUB_RELEASES_URL
