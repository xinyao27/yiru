import { fork } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { getDaemonLogFilePath } from '../observability/logs-directory'
import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { getProcessStartedAtMs } from './health'
import { materializeRelocatedDaemonHost } from './host-relocation'
import type { DaemonRuntimeHostOptions } from './runtime-host-options'
import { getDaemonPidPath, serializeDaemonPidFile, type DaemonProcessHandle } from './spawner'

const STARTUP_STDERR_MAX_BYTES = 8192
const DAEMON_START_TIMEOUT_MS = 10000

export async function spawnDaemonProcess(options: {
  entryPath: string
  host: DaemonRuntimeHostOptions
  runtimeDir: string
  socketPath: string
  tokenPath: string
}): Promise<DaemonProcessHandle> {
  const userDataPath = getRuntimeHostPathsProvider().userDataPath()
  const relocatedHost = materializeRelocatedDaemonHost()
  const child = fork(
    relocatedHost?.entryPath ?? options.entryPath,
    ['--socket', options.socketPath, '--token', options.tokenPath, ...daemonLogArguments()],
    {
      cwd: userDataPath,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      ...(relocatedHost ? { execPath: relocatedHost.execPath } : {}),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        YIRU_USER_DATA_PATH: userDataPath,
        ...(options.host.agentHookHost
          ? {
              YIRU_DAEMON_AGENT_HOOK_ENDPOINT_DIR: options.host.agentHookHost.endpointDir,
              YIRU_DAEMON_AGENT_HOOK_ENV: options.host.agentHookHost.env
            }
          : {})
      }
    }
  )
  await waitForDaemonReady(child, options.runtimeDir, options.entryPath)
  return {
    shutdown: async () => {
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGTERM')
        } catch {
          // Why: a daemon that already exited has satisfied shutdown.
        }
      }
    }
  }
}

function daemonLogArguments(): string[] {
  const disabled = (process.env.YIRU_DIAGNOSTICS_DISABLED ?? '').trim().toLowerCase()
  return disabled === '1' || disabled === 'true' ? [] : ['--log-file', getDaemonLogFilePath()]
}

async function waitForDaemonReady(
  child: ReturnType<typeof fork>,
  runtimeDir: string,
  entryPath: string
): Promise<void> {
  let startupStderr = ''
  let isCollectingStderr = true
  const onStartupStderr = (chunk: Buffer): void => {
    if (!isCollectingStderr) {
      return
    }
    startupStderr += chunk.toString('utf8')
    if (startupStderr.length > STARTUP_STDERR_MAX_BYTES) {
      startupStderr = startupStderr.slice(-STARTUP_STDERR_MAX_BYTES)
    }
  }
  child.stderr?.on('data', onStartupStderr)
  const releaseStderr = (): void => {
    isCollectingStderr = false
    child.stderr?.off('data', onStartupStderr)
    child.stderr?.destroy()
  }

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const cleanupListeners = (): void => {
      if (timer) {
        clearTimeout(timer)
      }
      child.off('message', onReady)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const fail = (error: Error): void => {
      if (settled) {
        return
      }
      settled = true
      cleanupListeners()
      const stderrTail = startupStderr.trim()
      if (stderrTail) {
        console.warn(`[daemon] startup failed; captured stderr tail:\n${stderrTail}`)
      }
      releaseStderr()
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGTERM')
        } catch {
          // Why: startup failure may race the child process exit.
        }
      }
      reject(
        stderrTail ? new Error(`${error.message}\nDaemon stderr (tail):\n${stderrTail}`) : error
      )
    }
    const onReady = (message: unknown): void => {
      if (
        settled ||
        !message ||
        typeof message !== 'object' ||
        (message as { type?: string }).type !== 'ready'
      ) {
        return
      }
      settled = true
      cleanupListeners()
      if (child.pid) {
        const selfReported = (message as { startedAtMs?: unknown }).startedAtMs
        writeFileSync(
          getDaemonPidPath(runtimeDir),
          serializeDaemonPidFile({
            pid: child.pid,
            startedAtMs:
              getProcessStartedAtMs(child.pid) ??
              (typeof selfReported === 'number' && Number.isFinite(selfReported)
                ? selfReported
                : null),
            entryPath,
            appVersion: getRuntimeHostPathsProvider().version()
          }),
          { mode: 0o600 }
        )
      }
      releaseStderr()
      child.disconnect()
      child.unref()
      resolve()
    }
    const onError = (error: Error): void => fail(error)
    const onExit = (code: number | null): void => {
      fail(new Error(`Daemon exited during startup with code ${code}`))
    }
    timer = setTimeout(() => fail(new Error('Daemon startup timed out')), DAEMON_START_TIMEOUT_MS)
    child.on('message', onReady)
    child.on('error', onError)
    child.on('exit', onExit)
  })
}
