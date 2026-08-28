import os from 'node:os'

import {
  getProcessOutputFields,
  iterateProcessOutputLines
} from '@yiru/runtime-protocol/workbench/process-output-field-scanner'

import { captureSubprocess } from '../subprocess-capture'

export type ProcessRow = {
  pid: number
  ppid: number
  cpu: number
  memory: number
}

export type ProcessIndex = {
  byPid: Map<number, ProcessRow>
  childrenOf: Map<number, number[]>
}

const PROCESS_EXEC_TIMEOUT_MS = 5_000
const PROCESS_MAX_BUFFER = 10 * 1024 * 1024

function parsePsOutput(stdout: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of iterateProcessOutputLines(stdout)) {
    const fields = getProcessOutputFields(line, 4)
    if (fields.length < 4) {
      continue
    }
    const pid = Number.parseInt(fields[0], 10)
    const ppid = Number.parseInt(fields[1], 10)
    const cpu = Number.parseFloat(fields[2])
    const rssKb = Number.parseInt(fields[3], 10)
    if (Number.isNaN(pid) || Number.isNaN(ppid)) {
      continue
    }
    rows.push({
      pid,
      ppid,
      cpu: Number.isFinite(cpu) && cpu > 0 ? cpu : 0,
      memory: Number.isFinite(rssKb) && rssKb > 0 ? rssKb * 1024 : 0
    })
  }
  return rows
}

function parseWmicOutput(stdout: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  let pid = Number.NaN
  let ppid = Number.NaN
  let workingSet = Number.NaN
  const flush = (): void => {
    if (!Number.isNaN(pid) && !Number.isNaN(ppid)) {
      rows.push({
        pid,
        ppid,
        cpu: 0,
        memory: Number.isFinite(workingSet) && workingSet > 0 ? workingSet : 0
      })
    }
    pid = Number.NaN
    ppid = Number.NaN
    workingSet = Number.NaN
  }
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const separator = line.indexOf('=')
    if (separator < 0) {
      continue
    }
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (key === 'ProcessId') {
      pid = Number.parseInt(value, 10)
    } else if (key === 'ParentProcessId') {
      ppid = Number.parseInt(value, 10)
    } else if (key === 'WorkingSetSize') {
      workingSet = Number.parseInt(value, 10)
    }
  }
  flush()
  return rows
}

async function enumerateUnix(): Promise<ProcessRow[]> {
  try {
    const { stdout } = await captureSubprocess('ps', ['-eo', 'pid=,ppid=,pcpu=,rss='], {
      maxBufferBytes: PROCESS_MAX_BUFFER,
      timeoutMs: PROCESS_EXEC_TIMEOUT_MS,
      // Why: ps CPU decimals must use dots so locale-independent parsing works.
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    })
    return parsePsOutput(stdout.toString())
  } catch (error) {
    console.warn('[memory] ps enumeration failed', error)
    return []
  }
}

async function enumerateWindows(): Promise<ProcessRow[]> {
  try {
    const { stdout } = await captureSubprocess(
      'wmic',
      ['process', 'get', 'ProcessId,ParentProcessId,WorkingSetSize', '/format:value'],
      { maxBufferBytes: PROCESS_MAX_BUFFER, timeoutMs: PROCESS_EXEC_TIMEOUT_MS }
    )
    return parseWmicOutput(stdout.toString())
  } catch (error) {
    console.warn('[memory] wmic enumeration failed', error)
    return []
  }
}

export async function enumerateProcesses(): Promise<ProcessIndex> {
  const rows = os.platform() === 'win32' ? await enumerateWindows() : await enumerateUnix()
  const byPid = new Map<number, ProcessRow>()
  const childrenOf = new Map<number, number[]>()
  for (const row of rows) {
    byPid.set(row.pid, row)
    const children = childrenOf.get(row.ppid)
    if (children) {
      children.push(row.pid)
    } else {
      childrenOf.set(row.ppid, [row.pid])
    }
  }
  return { byPid, childrenOf }
}

export function collectProcessSubtree(index: ProcessIndex, root: number): number[] {
  const result: number[] = []
  const seen = new Set<number>()
  const queue = [root]
  while (queue.length > 0) {
    const pid = queue.pop()
    if (pid === undefined || seen.has(pid)) {
      continue
    }
    seen.add(pid)
    if (index.byPid.has(pid)) {
      result.push(pid)
    }
    for (const child of index.childrenOf.get(pid) ?? []) {
      queue.push(child)
    }
  }
  return result
}
