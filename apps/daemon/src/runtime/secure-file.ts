import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

let windowsUserSid: string | null | undefined

export function writeSecureJsonFile(targetPath: string, value: unknown): void {
  writeSecureFile(targetPath, `${JSON.stringify(value, null, 2)}\n`)
}

export function writeSecureFile(targetPath: string, contents: string): void {
  const directory = dirname(targetPath)
  mkdirSync(directory, { mode: 0o700, recursive: true })
  hardenPath(directory, true)
  const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 })
    hardenPath(temporaryPath, false)
    renameSync(temporaryPath, targetPath)
    hardenPath(targetPath, false)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    throw error
  }
}

function hardenPath(targetPath: string, isDirectory: boolean): void {
  if (process.platform !== 'win32') {
    chmodSync(targetPath, isDirectory ? 0o700 : 0o600)
    return
  }
  const sid = resolveWindowsUserSid()
  const executable = resolveWindowsSystemExecutable('icacls.exe')
  const result = Bun.spawnSync([
    executable,
    targetPath,
    '/inheritance:r',
    '/grant:r',
    `*${sid}:(F)`,
    '/c',
    '/q'
  ])
  if (result.exitCode !== 0) {
    throw new Error('daemon_secure_file_acl_failed')
  }
}

function resolveWindowsUserSid(): string {
  if (windowsUserSid !== undefined) {
    if (windowsUserSid === null) {
      throw new Error('daemon_windows_user_sid_unavailable')
    }
    return windowsUserSid
  }
  const result = Bun.spawnSync([
    resolveWindowsSystemExecutable('whoami.exe'),
    '/user',
    '/fo',
    'csv',
    '/nh'
  ])
  const output = result.exitCode === 0 ? result.stdout.toString('utf8') : ''
  windowsUserSid = /"(S-\d+(?:-\d+)+)"/i.exec(output)?.[1] ?? null
  if (windowsUserSid === null) {
    throw new Error('daemon_windows_user_sid_unavailable')
  }
  return windowsUserSid
}

function resolveWindowsSystemExecutable(name: string): string {
  const systemRoot = process.env.SystemRoot?.trim()
  return systemRoot ? join(systemRoot, 'System32', name) : name
}
