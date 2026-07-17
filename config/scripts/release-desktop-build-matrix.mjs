#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const WINDOWS_RELEASE_BUILD = {
  // Why: windows-latest moved to the Windows 2025 / VS 2026 image before
  // node-gyp could detect VS 18, breaking native dependency install.
  os: 'windows-2022',
  platform: 'win',
  release_command:
    'node config/scripts/ensure-native-runtime.mjs --runtime=electron; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm exec electron-builder --config config/electron-builder.config.cjs --win --publish never',
  eb_cache_path: '~\\AppData\\Local\\electron\\Cache\n~\\AppData\\Local\\electron-builder\\Cache'
}

const LINUX_RELEASE_BUILDS = [
  {
    os: 'ubuntu-latest',
    platform: 'linux-x64',
    release_command:
      'node config/scripts/ensure-native-runtime.mjs --runtime=electron && pnpm exec electron-builder --config config/electron-builder.config.cjs --linux AppImage deb rpm --x64 --publish always',
    eb_cache_path: '~/.cache/electron\n~/.cache/electron-builder'
  },
  {
    os: 'ubuntu-24.04-arm',
    platform: 'linux-arm64',
    release_command:
      'node config/scripts/ensure-native-runtime.mjs --runtime=electron && YIRU_LINUX_ARM64_RELEASE=1 pnpm exec electron-builder --config config/electron-builder.config.cjs --linux AppImage deb rpm --arm64 --publish always',
    eb_cache_path: '~/.cache/electron\n~/.cache/electron-builder'
  }
]

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function createReleaseDesktopBuildMatrix(env = process.env) {
  const hasToken = configured(env.SIGNPATH_API_TOKEN)
  const hasOrganization = configured(env.SIGNPATH_ORGANIZATION_ID)

  if (hasToken !== hasOrganization) {
    const missingName = hasToken ? 'SIGNPATH_ORGANIZATION_ID' : 'SIGNPATH_API_TOKEN'
    throw new Error(`Incomplete SignPath configuration: missing ${missingName}`)
  }

  const windowsEnabled = hasToken && hasOrganization
  // Why: SignPath is the only production Windows signing path; when it is not
  // configured, publish the independently valid macOS/Linux release instead.
  const include = [...(windowsEnabled ? [WINDOWS_RELEASE_BUILD] : []), ...LINUX_RELEASE_BUILDS].map(
    (entry) => ({ ...entry })
  )

  return { matrix: { include }, windowsEnabled }
}

function main() {
  const { matrix, windowsEnabled } = createReleaseDesktopBuildMatrix()
  console.log(`matrix=${JSON.stringify(matrix)}`)
  console.log(`windows_enabled=${windowsEnabled}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
