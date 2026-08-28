import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export type PlatformScriptPlatform = 'linux' | 'windows'

const resolvedPaths = new Map<PlatformScriptPlatform, Promise<string | null>>()

export function platformScriptPlatform(): PlatformScriptPlatform | null {
  if (process.platform === 'linux') {
    return 'linux'
  }
  if (process.platform === 'win32') {
    return 'windows'
  }
  return null
}

export function resolvePlatformScriptProviderPath(
  platform = platformScriptPlatform()
): Promise<string | null> {
  if (!platform) {
    return Promise.resolve(null)
  }
  const cached = resolvedPaths.get(platform)
  if (cached) {
    return cached
  }
  const resolving = resolveProviderPath(platform)
  resolvedPaths.set(platform, resolving)
  resolving.catch(() => resolvedPaths.delete(platform))
  return resolving
}

async function resolveProviderPath(platform: PlatformScriptPlatform): Promise<string | null> {
  const override =
    process.env.YIRU_COMPUTER_PLATFORM_SCRIPT_PROVIDER_PATH?.trim() ||
    process.env.YIRU_COMPUTER_DESKTOP_SCRIPT_PROVIDER_PATH?.trim()
  if (override && existsSync(override)) {
    return override
  }

  const filename = platform === 'windows' ? 'runtime.ps1' : 'runtime.py'
  const directory = platform === 'windows' ? 'computer-use-windows' : 'computer-use-linux'
  const sourceCandidates = [
    join(process.cwd(), 'apps', 'daemon', 'native', directory, filename),
    join(process.cwd(), 'native', directory, filename),
    resolve(import.meta.dirname, '..', '..', 'native', directory, filename)
  ]
  const sourcePath = sourceCandidates.find(existsSync)
  if (sourcePath) {
    return sourcePath
  }

  const embedded = Bun.embeddedFiles.find(
    (file): file is Blob & { name: string } => 'name' in file && file.name === filename
  )
  if (!embedded) {
    return null
  }
  const bytes = new Uint8Array(await embedded.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const resourceDirectory = join(
    getRuntimeHostPathsProvider().userDataPath(),
    'native',
    'computer-use',
    digest
  )
  const resourcePath = join(resourceDirectory, filename)
  if (!existsSync(resourcePath)) {
    await mkdir(resourceDirectory, { recursive: true })
    await writeFile(resourcePath, bytes, { mode: 0o600 })
  }
  return resourcePath
}
