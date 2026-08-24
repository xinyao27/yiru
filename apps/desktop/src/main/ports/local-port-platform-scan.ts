import { execFile } from 'node:child_process'
import { readFile, readdir, readlink } from 'node:fs/promises'

import {
  dedupeRawPorts,
  parseLsofListeningOutput,
  parseNetstatListeningOutput,
  parseProcNetTcp
} from './local-port-parsers'
import type { ProcessMetadata, RawListeningPort } from './local-port-types'

const COMMAND_TIMEOUT_MS = 4_000

export async function scanPlatformListeningPorts(): Promise<RawListeningPort[]> {
  if (process.platform === 'linux') {
    return scanLinuxProcPorts()
  }
  if (process.platform === 'darwin') {
    return scanDarwinLsofPorts()
  }
  if (process.platform === 'win32') {
    return scanWindowsNetstatPorts()
  }
  throw new Error(`Port scanning is not supported on ${process.platform}`)
}

async function scanDarwinLsofPorts(): Promise<RawListeningPort[]> {
  const { stdout } = await runPortScanCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'])
  const ports = parseLsofListeningOutput(stdout)
  const metadata = await loadDarwinProcessMetadata(
    new Set(ports.flatMap((port) => (port.pid ? [port.pid] : [])))
  )
  return ports.map((port) => ({ ...metadata.get(port.pid ?? -1), ...port }))
}

async function scanWindowsNetstatPorts(): Promise<RawListeningPort[]> {
  const { stdout } = await runPortScanCommand('netstat', ['-ano', '-p', 'tcp'])
  const ports = parseNetstatListeningOutput(stdout)
  const metadata = await loadWindowsProcessMetadata(
    new Set(ports.flatMap((port) => (port.pid ? [port.pid] : [])))
  )
  return ports.map((port) => ({ ...metadata.get(port.pid ?? -1), ...port }))
}

async function scanLinuxProcPorts(): Promise<RawListeningPort[]> {
  const [tcp4, tcp6] = await Promise.all([
    readProcNet('/proc/net/tcp'),
    readProcNet('/proc/net/tcp6')
  ])
  const sockets = [...tcp4, ...tcp6]
  const inodeToPid = await mapLinuxInodesToPids(new Set(sockets.map((socket) => socket.inode)))
  const metadata = new Map<number, ProcessMetadata>()
  const rawPorts: RawListeningPort[] = []
  for (const socket of sockets) {
    const pid = inodeToPid.get(socket.inode)
    if (pid != null && !metadata.has(pid)) {
      metadata.set(pid, await loadLinuxProcessMetadata(pid))
    }
    rawPorts.push({
      host: socket.host,
      port: socket.port,
      pid,
      ...metadata.get(pid ?? -1)
    })
  }
  return dedupeRawPorts(rawPorts)
}

async function readProcNet(
  filePath: string
): Promise<{ host: string; port: number; inode: number }[]> {
  try {
    return parseProcNetTcp(await readFile(filePath, 'utf-8'))
  } catch {
    return []
  }
}

async function mapLinuxInodesToPids(inodes: Set<number>): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (inodes.size === 0) {
    return result
  }
  let pids: string[]
  try {
    pids = (await readdir('/proc')).filter((entry) => /^\d+$/.test(entry))
  } catch {
    return result
  }
  for (const pidText of pids) {
    let fds: string[]
    try {
      fds = await readdir(`/proc/${pidText}/fd`)
    } catch {
      continue
    }
    const pid = Number.parseInt(pidText, 10)
    for (const fd of fds) {
      let link: string
      try {
        link = await readlink(`/proc/${pidText}/fd/${fd}`)
      } catch {
        continue
      }
      const match = link.match(/^socket:\[(\d+)\]$/)
      if (match) {
        const inode = Number.parseInt(match[1], 10)
        if (inodes.has(inode)) {
          result.set(inode, pid)
        }
      }
    }
  }
  return result
}

async function loadLinuxProcessMetadata(pid: number): Promise<ProcessMetadata> {
  const [comm, cmdline, cwd] = await Promise.all([
    readTextIfAvailable(`/proc/${pid}/comm`),
    readTextIfAvailable(`/proc/${pid}/cmdline`),
    readlink(`/proc/${pid}/cwd`).catch(() => undefined)
  ])
  return {
    processName: comm?.trim() || undefined,
    commandLine: cmdline?.split('\u0000').join(' ').trim() || undefined,
    cwd
  }
}

async function loadDarwinProcessMetadata(pids: Set<number>): Promise<Map<number, ProcessMetadata>> {
  const result = new Map<number, ProcessMetadata>()
  const pidList = Array.from(pids).join(',')
  if (!pidList) {
    return result
  }
  const [cwdOutput, commandOutput] = await Promise.all([
    runPortScanCommand('lsof', ['-a', '-p', pidList, '-d', 'cwd', '-Fn']).catch(() => null),
    runPortScanCommand('ps', ['-p', pidList, '-o', 'pid=', '-o', 'command=']).catch(() => null)
  ])
  let currentPid: number | null = null
  for (const line of cwdOutput?.stdout.split('\n') ?? []) {
    if (line.startsWith('p')) {
      const pid = Number.parseInt(line.slice(1), 10)
      currentPid = Number.isFinite(pid) ? pid : null
    } else if (line.startsWith('n') && currentPid != null) {
      result.set(currentPid, { ...result.get(currentPid), cwd: line.slice(1) || undefined })
    }
  }
  for (const line of commandOutput?.stdout.split('\n') ?? []) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (match) {
      const pid = Number.parseInt(match[1], 10)
      result.set(pid, { ...result.get(pid), commandLine: match[2].trim() || undefined })
    }
  }
  return result
}

async function loadWindowsProcessMetadata(
  pids: Set<number>
): Promise<Map<number, ProcessMetadata>> {
  const result = new Map<number, ProcessMetadata>()
  if (pids.size === 0) {
    return result
  }
  try {
    const pidFilter = Array.from(pids)
      .filter(Number.isFinite)
      .map((pid) => `ProcessId=${pid}`)
      .join(' OR ')
    const { stdout } = await runPortScanCommand('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "${pidFilter}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`
    ])
    const parsed = JSON.parse(stdout) as
      | { ProcessId: number; Name?: string; CommandLine?: string }
      | { ProcessId: number; Name?: string; CommandLine?: string }[]
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      if (pids.has(row.ProcessId)) {
        result.set(row.ProcessId, {
          processName: row.Name,
          commandLine: row.CommandLine
        })
      }
    }
  } catch {
    // Process metadata is optional; port rows still render without attribution.
  }
  return result
}

async function runPortScanCommand(command: string, args: string[]): Promise<{ stdout: string }> {
  return await new Promise((resolve, reject) => {
    let settled = false
    let child: ReturnType<typeof execFile> | undefined
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child?.kill()
        reject(new CommandTimeoutError(command, COMMAND_TIMEOUT_MS))
      }
    }, COMMAND_TIMEOUT_MS)
    const settle = (callback: () => void): void => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        callback()
      }
    }
    // Why: execFile timeout only signals the child; this independent timer
    // guarantees settlement even if Node never invokes the callback.
    try {
      child = execFile(
        command,
        args,
        { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          settle(() => (error ? reject(error) : resolve({ stdout: String(stdout) })))
        }
      )
    } catch (error) {
      settle(() => reject(error))
    }
  })
}

class CommandTimeoutError extends Error {
  constructor(command: string, timeoutMs: number) {
    super(`${command} timed out after ${timeoutMs}ms`)
    this.name = 'CommandTimeoutError'
  }
}

export function isPortScanCommandTimeout(error: unknown): boolean {
  return error instanceof CommandTimeoutError
}

async function readTextIfAvailable(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}
