import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import {
  resolveMacOSComputerUseExecutablePath,
  resolveManagedMacOSComputerUseAppPath
} from './macos-native-provider-paths'

const RELEASE_ROOT = 'https://github.com/xinyao27/yiru/releases/download'
const HELPER_ASSET_NAME = 'yiru-computer-use-macos.zip'

export type MacOSHelperInstallResult = 'not-required' | 'already-installed' | 'installed'

export async function installMacOSComputerUseHelper(
  version = getRuntimeHostPathsProvider().version()
): Promise<MacOSHelperInstallResult> {
  if (process.platform !== 'darwin') {
    return 'not-required'
  }
  const paths = getRuntimeHostPathsProvider()
  const appPath = resolveManagedMacOSComputerUseAppPath()
  const executablePath = join(appPath, 'Contents', 'MacOS', 'yiru-computer-use-macos')
  const versionPath = join(appPath, '..', 'version')
  if (
    (await Bun.file(versionPath)
      .text()
      .catch(() => '')) === version &&
    Bun.file(executablePath).size > 0
  ) {
    return 'already-installed'
  }
  if (process.env.YIRU_COMPUTER_MACOS_HELPER_APP_PATH && resolveMacOSComputerUseExecutablePath()) {
    return 'already-installed'
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
    throw new Error('computer_use_helper_release_version_unavailable')
  }

  const releaseRoot = `${RELEASE_ROOT}/v${version}`
  const [assetResponse, checksumsResponse] = await Promise.all([
    fetch(`${releaseRoot}/${HELPER_ASSET_NAME}`, { signal: AbortSignal.timeout(60_000) }),
    fetch(`${releaseRoot}/yiru-checksums.txt`, { signal: AbortSignal.timeout(10_000) })
  ])
  if (!assetResponse.ok || !checksumsResponse.ok) {
    throw new Error('computer_use_helper_release_unavailable')
  }
  const archive = new Uint8Array(await assetResponse.arrayBuffer())
  const expected = releaseChecksum(await checksumsResponse.text(), HELPER_ASSET_NAME)
  const actual = new Bun.CryptoHasher('sha256').update(archive).digest('hex')
  if (actual !== expected) {
    throw new Error('computer_use_helper_checksum_mismatch')
  }

  const stagingDirectory = await mkdtemp(join(paths.tempPath(), 'yiru-computer-use-'))
  const archivePath = join(stagingDirectory, HELPER_ASSET_NAME)
  const stagedAppPath = join(stagingDirectory, 'Yiru Computer Use.app')
  const backupPath = `${appPath}.previous`
  try {
    await writeFile(archivePath, archive, { mode: 0o600 })
    await runRequired(['/usr/bin/ditto', '-x', '-k', archivePath, stagingDirectory])
    await runRequired(['/usr/bin/codesign', '--verify', '--deep', '--strict', stagedAppPath])
    await mkdir(join(appPath, '..'), { recursive: true })
    await rm(backupPath, { force: true, recursive: true })
    if (await Bun.file(executablePath).exists()) {
      await rename(appPath, backupPath)
    }
    try {
      await rename(stagedAppPath, appPath)
      await writeFile(versionPath, version, { mode: 0o600 })
      await rm(backupPath, { force: true, recursive: true })
    } catch (error) {
      await rm(appPath, { force: true, recursive: true })
      if (
        await Bun.file(join(backupPath, 'Contents', 'MacOS', 'yiru-computer-use-macos')).exists()
      ) {
        await rename(backupPath, appPath)
      }
      throw error
    }
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true })
  }
  return 'installed'
}

function releaseChecksum(checksums: string, assetName: string): string {
  const fields = checksums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((candidate) => candidate[1] === assetName)
  if (!fields?.[0] || !/^[a-f\d]{64}$/i.test(fields[0])) {
    throw new Error('computer_use_helper_checksum_missing')
  }
  return fields[0].toLowerCase()
}

async function runRequired(command: string[]): Promise<void> {
  const child = Bun.spawn(command, { stderr: 'pipe', stdout: 'ignore' })
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (exitCode !== 0) {
    throw new Error(`computer_use_helper_command_failed:${command[0]}:${stderr.trim()}`)
  }
}
