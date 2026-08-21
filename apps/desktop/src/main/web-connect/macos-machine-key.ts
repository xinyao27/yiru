import { spawnSync } from 'node:child_process'
import type { webcrypto } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const KEYCHAIN_SERVICE = 'ai.yiru.connect.machine-identity'
const KEYCHAIN_TIMEOUT_MS = 15_000

export function readMacMachinePrivateKey(account: string): webcrypto.JsonWebKey | null {
  const result = runHelper(['read', KEYCHAIN_SERVICE, account])
  if (result.status === 44) {
    return null
  }
  assertSecuritySuccess(result, 'read')
  try {
    const value: unknown = JSON.parse(result.stdout.trim())
    if (!value || typeof value !== 'object') {
      throw new Error('The stored value is not a private key.')
    }
    return value
  } catch (error) {
    throw new Error('The Yiru machine identity in macOS Keychain is unreadable.', {
      cause: error
    })
  }
}

export function writeMacMachinePrivateKey(account: string, privateKey: webcrypto.JsonWebKey): void {
  const result = runHelper(['write', KEYCHAIN_SERVICE, account], JSON.stringify(privateKey))
  assertSecuritySuccess(result, 'write')
}

export function deleteMacMachinePrivateKey(account: string): void {
  const result = runHelper(['delete', KEYCHAIN_SERVICE, account])
  if (result.status === 44) {
    return
  }
  assertSecuritySuccess(result, 'delete')
}

type SecurityResult = {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

function runHelper(args: string[], input?: string): SecurityResult {
  const result = spawnSync(resolveHelperPath(), args, {
    encoding: 'utf8',
    input,
    timeout: KEYCHAIN_TIMEOUT_MS
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error ? { error: result.error } : {})
  }
}

function resolveHelperPath(): string {
  // Why: packaged builds ship the helper beside the executable (Contents/MacOS
  // via extraFiles), which is the same location for the app and the CLI shim.
  const packaged = join(dirname(process.execPath), 'yiru-machine-key')
  if (existsSync(packaged)) {
    return packaged
  }
  // Why: development builds have no such layout, and this module is loaded from
  // two different output depths — out/cli/connect/ for the CLI and the bundled
  // out/main/ for the app — so both distances to apps/desktop/ are tried.
  const developmentSuffix = 'native/machine-key-macos/.build/release/yiru-machine-key'
  for (const relativeRoot of ['../../..', '../..']) {
    const development = resolve(__dirname, relativeRoot, developmentSuffix)
    if (existsSync(development)) {
      return development
    }
  }
  throw new Error('The Yiru macOS Keychain helper is missing. Reinstall Yiru and try again.')
}

function assertSecuritySuccess(result: SecurityResult, operation: string): void {
  if (result.status === 0 && !result.error) {
    return
  }
  const detail =
    result.error?.message ?? result.stderr.trim() ?? `exit ${result.status ?? 'unknown'}`
  throw new Error(`Could not ${operation} the Yiru machine identity in macOS Keychain: ${detail}`)
}
