import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const WINDOWS_PATH_COMMAND_TIMEOUT_MS = 5_000

export function splitPathEntries(platform: NodeJS.Platform, value: string | null): string[] {
  if (!value) {
    return []
  }
  return value
    .split(platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function uniquePathEntries(platform: NodeJS.Platform, entries: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of entries) {
    const key = platform === 'win32' ? normalizeWindowsPath(entry) : entry
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(entry)
  }
  return result
}

export function samePathEntry(platform: NodeJS.Platform, left: string, right: string): boolean {
  return platform === 'win32'
    ? normalizeWindowsPath(left) === normalizeWindowsPath(right)
    : left === right
}

export function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const childRelative = relative(parentPath, childPath)
  return childRelative === '' || (!childRelative.startsWith('..') && !isAbsolute(childRelative))
}

export async function isExecutableFile(commandPath: string): Promise<boolean> {
  try {
    const stats = await stat(commandPath)
    if (!stats.isFile()) {
      return false
    }
    await access(commandPath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function normalizeWindowsPath(value: string): string {
  return value.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
}

export function escapeWindowsBatchValue(value: string): string {
  return value.replaceAll('"', '""')
}

export function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ((error as NodeJS.ErrnoException).code === 'EACCES' ||
      (error as NodeJS.ErrnoException).code === 'EPERM')
  )
}

export function isMissingError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

// Why: localized permission errors retain these .NET/ACL markers even when
// their human-readable PowerShell text is mojibake.
export function isWindowsUserPathPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const stderr =
    'stderr' in error && typeof (error as { stderr?: unknown }).stderr === 'string'
      ? (error as { stderr: string }).stderr
      : ''
  const haystack = `${error.message}\n${stderr}`
  return (
    haystack.includes('UnauthorizedAccessException') ||
    haystack.includes('SecurityException') ||
    haystack.includes('Requested registry access is not allowed') ||
    haystack.includes('Access is denied') ||
    haystack.includes('Access to the registry key')
  )
}

export function quoteShell(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export async function runMacPrivilegedCommand(command: string): Promise<void> {
  await execFileAsync('osascript', [
    '-e',
    `do shell script ${quoteAppleScript(command)} with administrator privileges`
  ])
}

function quoteAppleScript(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function isAbsoluteForPlatform(platform: NodeJS.Platform, value: string): boolean {
  if (platform === 'win32') {
    return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
  }
  return isAbsolute(value)
}

export async function readWindowsUserPath(): Promise<string | null> {
  const stdout = await runWindowsPathCommand([
    '-NoProfile',
    '-Command',
    "[Environment]::GetEnvironmentVariable('Path','User')"
  ])
  return stdout.trim() || null
}

export async function writeWindowsUserPath(value: string): Promise<void> {
  await runWindowsPathCommand([
    '-NoProfile',
    '-Command',
    // Why: PATH registration must stay user-scoped on Windows so the Yiru
    // desktop app can manage the public shell command without requiring
    // elevation or mutating machine-wide environment state.
    `[Environment]::SetEnvironmentVariable('Path', ${quotePowerShell(value)}, 'User')`
  ])
}

function runWindowsPathCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof execFile> | null = null
    let settled = false

    const finish = (error: Error | null, stdout = ''): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    }

    // Why: Windows PATH reads/writes back CLI Settings; wedged PowerShell must
    // not keep command registration status or install/remove pending forever.
    const timeout = setTimeout(() => {
      child?.kill()
      finish(
        new Error(`Windows PATH command timed out after ${WINDOWS_PATH_COMMAND_TIMEOUT_MS}ms.`)
      )
    }, WINDOWS_PATH_COMMAND_TIMEOUT_MS)

    try {
      child = execFile(
        'powershell',
        args,
        { encoding: 'utf8', timeout: WINDOWS_PATH_COMMAND_TIMEOUT_MS },
        (error, stdout) => {
          finish(error ?? null, stdout)
        }
      )
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
