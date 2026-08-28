import { resolve } from 'node:path'

import { resolveDefaultUserDataPath } from '../runtime/paths'
import { resolveDaemonServiceCommand } from '../service/command'
import { readDaemonServiceState, scheduleWindowsDaemonServiceRestart } from '../service/manager'

const RESTART_PARENT_ENV = 'YIRU_RESTART_PARENT_PID'
const RESTART_PARENT_TIMEOUT_MS = 30_000
const RESTART_POLL_INTERVAL_MS = 50

export type DaemonRestart = () => void

export function createDaemonRestart(userDataPath: string, daemonArgs: string[]): DaemonRestart {
  let isRequested = false
  const isDefaultRuntime =
    resolve(userDataPath) === resolve(resolveDefaultUserDataPath()) &&
    readDaemonServiceState() === 'running'

  return () => {
    if (isRequested) {
      return
    }
    if (isDefaultRuntime) {
      if (process.platform === 'win32') {
        scheduleWindowsDaemonServiceRestart(process.pid)
      }
    } else {
      launchReplacement(daemonArgs)
    }
    isRequested = true
    setTimeout(() => process.kill(process.pid, 'SIGHUP'), 150)
  }
}

export async function waitForRestartParent(): Promise<void> {
  const rawPid = process.env[RESTART_PARENT_ENV]
  delete process.env[RESTART_PARENT_ENV]
  if (!rawPid) {
    return
  }
  const parentPid = Number(rawPid)
  if (!Number.isInteger(parentPid) || parentPid <= 0 || parentPid === process.pid) {
    throw new Error('daemon_restart_parent_invalid')
  }
  const deadline = Date.now() + RESTART_PARENT_TIMEOUT_MS
  while (isProcessRunning(parentPid)) {
    if (Date.now() >= deadline) {
      throw new Error('daemon_restart_parent_timeout')
    }
    await Bun.sleep(RESTART_POLL_INTERVAL_MS)
  }
}

function launchReplacement(daemonArgs: string[]): void {
  const command = resolveDaemonServiceCommand()
  const child = Bun.spawn([command.executable, ...command.arguments, ...daemonArgs], {
    detached: true,
    env: { ...process.env, [RESTART_PARENT_ENV]: String(process.pid) },
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore'
  })
  child.unref()
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isPermissionError(error)
  }
}

function isPermissionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'EPERM'
}
