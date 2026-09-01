import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { translate } from '../i18n/translate'
import { writeSecureFile } from '../runtime/secure-file'
import { YIRU_EXTENSION_ORIGIN, YIRU_NATIVE_HOST_NAME } from './identity'

type NativeHostManifest = {
  allowed_origins: string[]
  description: string
  name: string
  path: string
  type: 'stdio'
}

export function installNativeMessagingHost(argv: string[]): void {
  const manifestPath = resolveNativeHostManifestPath()
  const manifest: NativeHostManifest = {
    allowed_origins: [`${YIRU_EXTENSION_ORIGIN}/`],
    description: translate('Starts and connects the local Yiru daemon'),
    name: YIRU_NATIVE_HOST_NAME,
    path: resolve(process.execPath),
    type: 'stdio'
  }
  writeSecureFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  if (process.platform === 'win32') {
    const registration = Bun.spawnSync([
      'reg.exe',
      'ADD',
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${YIRU_NATIVE_HOST_NAME}`,
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      manifestPath,
      '/f'
    ])
    if (registration.exitCode !== 0) {
      throw new Error('native_messaging_registry_failed')
    }
  }
  if (argv.includes('--silent')) {
    return
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: true, manifestPath, extensionOrigin: YIRU_EXTENSION_ORIGIN }))
    return
  }
  console.log(`${translate('Yiru native messaging host installed')}: ${manifestPath}`)
}

function resolveNativeHostManifestPath(): string {
  const configuredRoot = process.env.YIRU_NATIVE_MESSAGING_CONFIG_ROOT?.trim()
  if (configuredRoot) {
    return join(resolve(configuredRoot), `${YIRU_NATIVE_HOST_NAME}.json`)
  }
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${YIRU_NATIVE_HOST_NAME}.json`
    )
  }
  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || process.env.APPDATA
    if (!appData) {
      throw new Error(translate('APPDATA is required to install native messaging'))
    }
    return join(appData, 'Yiru', 'NativeMessagingHosts', `${YIRU_NATIVE_HOST_NAME}.json`)
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'google-chrome',
    'NativeMessagingHosts',
    `${YIRU_NATIVE_HOST_NAME}.json`
  )
}
