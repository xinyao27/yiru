import { readlink } from 'node:fs/promises'
import { basename } from 'node:path'

const PROCESS_FACT_TIMEOUT_MS = 1_500
const CWD_CACHE_TTL_MS = 1_500

export type ProcessRecord = {
  command: string
  parentPid: number
  pid: number
  terminalProcessGroup: number | null
}

type ProcessFacts = {
  descendants: ProcessRecord[]
  foregroundCommand: string | null
}

type CwdCacheEntry = {
  at: number
  value: string
}

const cwdCache = new Map<number, CwdCacheEntry>()
const cwdInflight = new Map<number, Promise<string>>()

export async function readTerminalProcessFacts(pid: number): Promise<ProcessFacts> {
  const records = await readSystemProcessRecords()
  const root = records.find((record) => record.pid === pid)
  const descendants = findDescendants(records, pid)
  return {
    descendants,
    foregroundCommand: resolveForegroundCommand(records, root, descendants)
  }
}

export async function readSystemProcessRecords(): Promise<ProcessRecord[]> {
  return process.platform === 'win32' ? readWindowsProcesses() : readPosixProcesses()
}

export function descendantProcessIds(records: ProcessRecord[], rootPid: number): Set<number> {
  return new Set([rootPid, ...findDescendants(records, rootPid).map((record) => record.pid)])
}

export async function readProcessCwd(pid: number): Promise<string> {
  const now = Date.now()
  const cached = cwdCache.get(pid)
  if (cached && now - cached.at < CWD_CACHE_TTL_MS) {
    return cached.value
  }
  const active = cwdInflight.get(pid)
  if (active) {
    return active
  }
  const request = resolveProcessCwd(pid).then((value) => {
    cwdCache.set(pid, { at: Date.now(), value })
    cwdInflight.delete(pid)
    for (const [cachedPid, entry] of cwdCache) {
      if (Date.now() - entry.at >= CWD_CACHE_TTL_MS) {
        cwdCache.delete(cachedPid)
      }
    }
    return value
  })
  cwdInflight.set(pid, request)
  return request
}

async function resolveProcessCwd(pid: number): Promise<string> {
  if (process.platform === 'linux') {
    try {
      return await readlink(`/proc/${pid}/cwd`)
    } catch {
      return ''
    }
  }
  if (process.platform !== 'darwin') {
    return ''
  }
  const output = await readCommand('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  return (
    output
      .split('\n')
      .find((line) => line.startsWith('n') && line.includes('/'))
      ?.slice(1) ?? ''
  )
}

async function readPosixProcesses(): Promise<ProcessRecord[]> {
  const output = await readCommand('ps', ['-axo', 'pid=,ppid=,tpgid=,comm='])
  const records: ProcessRecord[] = []
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(.+?)\s*$/.exec(line)
    if (!match) {
      continue
    }
    records.push({
      command: match[4],
      parentPid: Number(match[2]),
      pid: Number(match[1]),
      terminalProcessGroup: Number(match[3]) > 0 ? Number(match[3]) : null
    })
  }
  return records
}

async function readWindowsProcesses(): Promise<ProcessRecord[]> {
  const executable = Bun.which('pwsh.exe') ?? Bun.which('powershell.exe')
  if (!executable) {
    return []
  }
  const script = [
    'Get-CimInstance Win32_Process',
    'Select-Object ProcessId,ParentProcessId,Name',
    'ConvertTo-Json -Compress'
  ].join(' | ')
  const output = await readCommand(executable, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script
  ])
  return parseWindowsProcesses(output)
}

function parseWindowsProcesses(output: string): ProcessRecord[] {
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    return []
  }
  const rows = Array.isArray(value) ? value : [value]
  const records: ProcessRecord[] = []
  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }
    const pid = readFiniteNumber(row.ProcessId)
    const parentPid = readFiniteNumber(row.ParentProcessId)
    if (pid === null || parentPid === null || typeof row.Name !== 'string') {
      continue
    }
    records.push({ command: row.Name, parentPid, pid, terminalProcessGroup: null })
  }
  return records
}

function findDescendants(records: ProcessRecord[], rootPid: number): ProcessRecord[] {
  const found: ProcessRecord[] = []
  const parents = new Set([rootPid])
  let didFind = true
  while (didFind) {
    didFind = false
    for (const record of records) {
      if (parents.has(record.parentPid) && !parents.has(record.pid)) {
        parents.add(record.pid)
        found.push(record)
        didFind = true
      }
    }
  }
  return found
}

function resolveForegroundCommand(
  records: ProcessRecord[],
  root: ProcessRecord | undefined,
  descendants: ProcessRecord[]
): string | null {
  if (!root) {
    return null
  }
  const terminalForeground = root.terminalProcessGroup
    ? records.find((record) => record.pid === root.terminalProcessGroup)
    : undefined
  if (terminalForeground) {
    return basename(terminalForeground.command)
  }
  if (descendants.length === 0) {
    return basename(root.command)
  }
  const parentPids = new Set(descendants.map((record) => record.parentPid))
  const leaves = descendants.filter((record) => !parentPids.has(record.pid))
  // Why: Bun.Terminal does not expose a foreground process group on every host. A sole observed
  // leaf is unambiguous; competing leaves are reported as unknown instead of guessed.
  return leaves.length === 1 ? basename(leaves[0].command) : null
}

async function readCommand(executable: string, argv: string[]): Promise<string> {
  try {
    const child = Bun.spawn([executable, ...argv], {
      signal: AbortSignal.timeout(PROCESS_FACT_TIMEOUT_MS),
      stderr: 'ignore',
      stdout: 'pipe'
    })
    const [exitCode, output] = await Promise.all([child.exited, new Response(child.stdout).text()])
    return exitCode === 0 ? output : ''
  } catch {
    return ''
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
