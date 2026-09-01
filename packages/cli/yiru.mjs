#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
// Why: npm and bunx need one portable entrypoint that installs the platform Bun binary, verifies
// its release checksum, registers Native Messaging, starts the user service, and forwards argv.
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const packageMetadata = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'))
const packageVersion = packageMetadata.version
const repository = 'xinyao27/yiru'
const target = resolveTarget()
const executableName = process.platform === 'win32' ? 'yiru.exe' : 'yiru'
const assetName = `yiru-${target}${process.platform === 'win32' ? '.exe' : ''}`
const installDirectory =
  process.env.YIRU_INSTALL_DIR ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || homedir(), 'Yiru', 'bin')
    : join(homedir(), '.local', 'bin'))
const executablePath = join(installDirectory, executableName)
const versionPath = join(installDirectory, 'yiru.version')

if (!existsSync(executablePath) || readInstalledVersion() !== packageVersion) {
  const isUpgrade = existsSync(executablePath)
  await installBinary()
  runRequiredSetup(['install', ...(isUpgrade ? ['--no-browser'] : [])])
}

const result = spawnSync(executablePath, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  throw result.error
}
process.exit(result.status ?? 1)

async function installBinary() {
  mkdirSync(installDirectory, { recursive: true })
  const releaseBase = `https://github.com/${repository}/releases/download/v${packageVersion}`
  const [binaryResponse, checksumsResponse] = await Promise.all([
    fetch(`${releaseBase}/${assetName}`),
    fetch(`${releaseBase}/yiru-checksums.txt`)
  ])
  if (!binaryResponse.ok || !checksumsResponse.ok) {
    throw new Error(`Yiru ${packageVersion} release artifacts are unavailable.`)
  }
  const binary = new Uint8Array(await binaryResponse.arrayBuffer())
  const expectedChecksum = findChecksum(await checksumsResponse.text(), assetName)
  const actualChecksum = createHash('sha256').update(binary).digest('hex')
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum verification failed for ${assetName}.`)
  }
  const stagingPath = `${executablePath}.download-${process.pid}`
  try {
    writeFileSync(stagingPath, binary, { mode: 0o755 })
    chmodSync(stagingPath, 0o755)
    renameSync(stagingPath, executablePath)
    writeFileSync(versionPath, `${packageVersion}\n`, { mode: 0o600 })
  } catch (error) {
    if (existsSync(stagingPath)) {
      unlinkSync(stagingPath)
    }
    throw error
  }
}

function findChecksum(checksums, name) {
  const match = checksums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === name)
  if (!match || !/^[a-f\d]{64}$/i.test(match[0])) {
    throw new Error(`The release checksum list does not contain ${name}.`)
  }
  return match[0].toLowerCase()
}

function readInstalledVersion() {
  try {
    return readFileSync(versionPath, 'utf8').trim()
  } catch {
    return ''
  }
}

function resolveTarget() {
  const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : ''
  if (!architecture) {
    throw new Error(`Unsupported CPU architecture: ${process.arch}`)
  }
  if (process.platform === 'darwin') {
    return `bun-darwin-${architecture}`
  }
  if (process.platform === 'win32' && architecture === 'x64') {
    return 'bun-windows-x64'
  }
  if (process.platform === 'linux') {
    const report = process.report?.getReport()
    const isMusl = !report?.header?.glibcVersionRuntime
    return `bun-linux-${architecture}${isMusl ? '-musl' : ''}`
  }
  throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`)
}

function runRequiredSetup(argumentsList) {
  const setup = spawnSync(executablePath, argumentsList, { stdio: 'inherit' })
  if (setup.error) {
    throw setup.error
  }
  if (setup.status !== 0) {
    throw new Error(`Yiru was installed, but '${argumentsList.join(' ')}' did not complete.`)
  }
}
