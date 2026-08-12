import { spawnSync } from 'node:child_process'
import type { webcrypto } from 'node:crypto'

const KEYCHAIN_SERVICE = 'ai.yiru.connect.machine-identity'
const KEYCHAIN_TIMEOUT_MS = 15_000

export function readMacMachinePrivateKey(account: string): webcrypto.JsonWebKey | null {
  const result = runSecurity(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'])
  if (result.status === 44 || result.stderr.toLowerCase().includes('could not be found')) {
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
  // Why: omitting the value after the final `-w` makes `security` read it from
  // stdin, keeping the long-lived private key out of argv and process listings.
  const result = runSecurity(
    ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
    `${JSON.stringify(privateKey)}\n`
  )
  assertSecuritySuccess(result, 'write')
}

export function deleteMacMachinePrivateKey(account: string): void {
  const result = runSecurity(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account])
  if (result.status === 44 || result.stderr.toLowerCase().includes('could not be found')) {
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

function runSecurity(args: string[], input?: string): SecurityResult {
  const result = spawnSync('/usr/bin/security', args, {
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

function assertSecuritySuccess(result: SecurityResult, operation: string): void {
  if (result.status === 0 && !result.error) {
    return
  }
  const detail =
    result.error?.message ?? result.stderr.trim() ?? `exit ${result.status ?? 'unknown'}`
  throw new Error(`Could not ${operation} the Yiru machine identity in macOS Keychain: ${detail}`)
}
