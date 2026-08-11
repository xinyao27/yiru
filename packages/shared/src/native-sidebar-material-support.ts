const WINDOWS_ACRYLIC_MIN_BUILD = 22621

function getWindowsBuildNumber(osRelease: string): number | null {
  const build = Number.parseInt(osRelease.split('.')[2] ?? '', 10)
  return Number.isInteger(build) ? build : null
}

export function supportsNativeSidebarMaterial(
  platform: NodeJS.Platform,
  osRelease: string
): boolean {
  if (platform === 'darwin') {
    return true
  }
  if (platform !== 'win32') {
    return false
  }
  const build = getWindowsBuildNumber(osRelease)
  // Why: Electron's Acrylic background material is available only on
  // Windows 11 22H2 (build 22621) and newer.
  return build !== null && build >= WINDOWS_ACRYLIC_MIN_BUILD
}
