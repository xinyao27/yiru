import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { installMacOSComputerUseHelper } from '../computer/macos-helper-install'
import { DaemonUpdateService } from './service'

const RELEASE_ROOT = 'https://github.com/xinyao27/yiru/releases/download'
const MAX_UPDATE_BINARY_BYTES = 256 * 1024 * 1024

export async function installLatestDaemon(
  options: {
    service?: DaemonUpdateService
    onDownloadProgress?: (percent: number) => void
  } = {}
): Promise<{
  installed: boolean
  version: string
}> {
  const status = await (options.service ?? new DaemonUpdateService()).check(true)
  if (!status.latestVersion || !status.updateAvailable) {
    return { installed: false, version: status.currentVersion }
  }
  assertSelfUpdateSupported(status.currentVersion)
  const assetName = releaseAssetName()
  const releaseRoot = `${RELEASE_ROOT}/v${status.latestVersion}`
  const [binaryResponse, checksumsResponse] = await Promise.all([
    fetch(`${releaseRoot}/${assetName}`, { signal: AbortSignal.timeout(60_000) }),
    fetch(`${releaseRoot}/yiru-checksums.txt`, { signal: AbortSignal.timeout(10_000) })
  ])
  if (!binaryResponse.ok || !checksumsResponse.ok) {
    throw new Error('daemon_update_artifact_unavailable')
  }
  const binary = await readReleaseBinary(binaryResponse, options.onDownloadProgress)
  const expected = findChecksum(await checksumsResponse.text(), assetName)
  const actual = new Bun.CryptoHasher('sha256').update(binary).digest('hex')
  if (actual !== expected) {
    throw new Error('daemon_update_checksum_mismatch')
  }
  await installMacOSComputerUseHelper(status.latestVersion)
  replaceExecutable(binary)
  return { installed: true, version: status.latestVersion }
}

async function readReleaseBinary(
  response: Response,
  onProgress?: (percent: number) => void
): Promise<Uint8Array> {
  const declaredBytes = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_UPDATE_BINARY_BYTES) {
    throw new Error('daemon_update_artifact_too_large')
  }
  if (!response.body) {
    const binary = new Uint8Array(await response.arrayBuffer())
    if (binary.byteLength > MAX_UPDATE_BINARY_BYTES) {
      throw new Error('daemon_update_artifact_too_large')
    }
    onProgress?.(100)
    return binary
  }
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let receivedBytes = 0
  let lastPercent = -1
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    receivedBytes += result.value.byteLength
    if (receivedBytes > MAX_UPDATE_BINARY_BYTES) {
      await reader.cancel()
      throw new Error('daemon_update_artifact_too_large')
    }
    chunks.push(result.value)
    const percent =
      Number.isFinite(declaredBytes) && declaredBytes > 0
        ? Math.min(100, Math.floor((receivedBytes / declaredBytes) * 100))
        : 0
    if (percent !== lastPercent) {
      lastPercent = percent
      onProgress?.(percent)
    }
  }
  const binary = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    binary.set(chunk, offset)
    offset += chunk.byteLength
  }
  onProgress?.(100)
  return binary
}

function assertSelfUpdateSupported(currentVersion: string): void {
  const executable = process.execPath
  if (currentVersion === '0.0.0' || basename(executable).startsWith('bun')) {
    throw new Error('daemon_update_development_build')
  }
  if (process.platform === 'win32' || existsSync(join(dirname(executable), 'yiru.version'))) {
    throw new Error('daemon_update_use_npm')
  }
  if (executable.includes('/Cellar/yiru/') || executable.includes('/homebrew/')) {
    throw new Error('daemon_update_use_homebrew')
  }
  accessSync(dirname(executable), constants.W_OK)
}

function replaceExecutable(binary: Uint8Array): void {
  const executable = process.execPath
  const staging = `${executable}.update-${process.pid}`
  const backup = `${executable}.previous`
  try {
    writeFileSync(staging, binary, { mode: 0o755 })
    chmodSync(staging, 0o755)
    if (existsSync(backup)) {
      unlinkSync(backup)
    }
    renameSync(executable, backup)
    try {
      renameSync(staging, executable)
    } catch (error) {
      renameSync(backup, executable)
      throw error
    }
  } finally {
    if (existsSync(staging)) {
      unlinkSync(staging)
    }
  }
}

function releaseAssetName(): string {
  const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  if (!architecture) {
    throw new Error('daemon_update_architecture_unsupported')
  }
  if (process.platform === 'darwin') {
    return `yiru-bun-darwin-${architecture}`
  }
  if (process.platform === 'linux') {
    const report: unknown = process.report?.getReport()
    const header =
      typeof report === 'object' && report !== null ? Reflect.get(report, 'header') : null
    const isMusl =
      typeof header !== 'object' ||
      header === null ||
      typeof Reflect.get(header, 'glibcVersionRuntime') !== 'string'
    return `yiru-bun-linux-${architecture}${isMusl ? '-musl' : ''}`
  }
  throw new Error('daemon_update_platform_unsupported')
}

function findChecksum(checksums: string, assetName: string): string {
  const fields = checksums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((candidate) => candidate[1] === assetName)
  if (!fields?.[0] || !/^[a-f\d]{64}$/i.test(fields[0])) {
    throw new Error('daemon_update_checksum_missing')
  }
  return fields[0].toLowerCase()
}
