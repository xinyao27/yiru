import { exec, spawn, type ChildProcess } from 'node:child_process'

import type { CommitMessagePlan } from '@yiru/runtime-protocol/workbench/commit-message/plan'

import { wslAwareSpawn } from '../git/runner/runner'
import { getSpawnArgsForWindows, UnsafeWindowsBatchArgumentsError } from '../platform/windows-host'
import { resolveCliCommand } from '../runtime/cli-command'
import { finalizeFromAgentOutput, userFacingUnsafeWindowsBatchArgs } from './generation-failure'
import { GENERATION_TIMEOUT_MS, MAX_AGENT_OUTPUT_BYTES } from './generation-limits'
import type { InternalTextGenerationResult, TextGenerationOperation } from './generation-types'

// Why: on Windows, npm-installed CLIs like `claude` and `codex` are usually
// `.cmd` shims. We route those through cmd.exe so Node can launch them, and
// `child.kill()` would only terminate the wrapper. `taskkill /T /F` walks the
// process tree from the wrapper PID and force-kills every descendant, which is
// what users expect when they hit "stop generating".
export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) {
    return
  }
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`, () => {
      // Best-effort; the spawn's `close` listener fires once the tree exits.
    })
    return
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // The child may have already exited between the in-flight check and the
    // kill - that race is benign and can be ignored.
  }
}

// Keying by operation plus `local:${cwd}` keeps local cancellation independent
// from SSH worktrees and from other generation features in the same worktree.
const cancelTokensByLane = new Map<string, () => void>()
const WSL_LAUNCHER_ENV_KEYS = [
  'ComSpec',
  'COMSPEC',
  'Path',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'WINDIR'
] as const

function localLaneKey(operation: TextGenerationOperation, cwd: string): string {
  return `${operation}:local:${cwd}`
}

export function cancelGenerateCommitMessageLocal(cwd: string): void {
  cancelTokensByLane.get(localLaneKey('commit-message', cwd))?.()
}

export function buildWslLauncherEnv(explicitEnv: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of WSL_LAUNCHER_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) {
      env[key] = value
    }
  }
  for (const [key, value] of Object.entries(explicitEnv ?? {})) {
    if (value !== undefined && value !== process.env[key]) {
      env[key] = value
    }
  }
  return env
}

export async function runLocalPlan(
  plan: CommitMessagePlan,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  emptyResultName = 'message',
  operation: TextGenerationOperation = 'commit-message',
  wslDistro?: string
): Promise<InternalTextGenerationResult> {
  const { binary, args, stdinPayload, label } = plan
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      const spawnEnv = env ?? process.env
      if (process.platform === 'win32' && wslDistro) {
        child = wslAwareSpawn(binary, args, {
          cwd,
          env: buildWslLauncherEnv(env),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          wslDistro,
          useWslLoginShell: true
        })
      } else {
        const resolvedBinary =
          process.platform === 'win32'
            ? resolveCliCommand(binary, { pathEnv: spawnEnv.PATH ?? spawnEnv.Path ?? null })
            : binary
        const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolvedBinary, args)
        child = spawn(spawnCmd, spawnArgs, {
          cwd,
          env: spawnEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      }
    } catch (error) {
      if (error instanceof UnsafeWindowsBatchArgumentsError) {
        resolve({
          success: false,
          error: userFacingUnsafeWindowsBatchArgs(label)
        })
        return
      }
      console.error('[commit-message] Failed to spawn local generator:', error)
      resolve({
        success: false,
        error: `${label} could not be started. Check the agent command in Settings and try again.`
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let outputLimitExceeded = false
    let settled = false
    let canceledByUser = false
    const laneKey = localLaneKey(operation, cwd)
    let cancelToken: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let detachChildListeners = (): void => {}
    const finalize = (result: InternalTextGenerationResult): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      detachChildListeners()
      if (cancelToken && cancelTokensByLane.get(laneKey) === cancelToken) {
        cancelTokensByLane.delete(laneKey)
      }
      resolve(result)
    }

    cancelToken = () => {
      canceledByUser = true
      killProcessTree(child)
      // Why: cancellation is a user-visible UI command; do not wait for a
      // wedged agent CLI to emit `close` before the request leaves loading.
      finalize({ success: false, error: 'Generation canceled.', canceled: true })
    }
    cancelTokensByLane.set(laneKey, cancelToken)

    timer = setTimeout(() => {
      killProcessTree(child)
      finalize({
        success: false,
        error: `Generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s.`
      })
    }, GENERATION_TIMEOUT_MS)

    const onStdoutData = (chunk: Buffer): void => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > MAX_AGENT_OUTPUT_BYTES) {
        outputLimitExceeded = true
        killProcessTree(child)
        return
      }
      stdout += chunk.toString('utf-8')
    }
    const onStderrData = (chunk: Buffer): void => {
      stderrBytes += chunk.byteLength
      if (stderrBytes > MAX_AGENT_OUTPUT_BYTES) {
        outputLimitExceeded = true
        killProcessTree(child)
        return
      }
      stderr += chunk.toString('utf-8')
    }
    const onError = (error: Error): void => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        finalize({
          success: false,
          error: `${binary} not found on PATH. Install ${label} to use AI commit messages.`
        })
        return
      }
      console.error('[commit-message] Local generator failed after spawn:', error)
      finalize({
        success: false,
        error: `${label} failed to start. Check the agent command in Settings and try again.`
      })
    }
    const onClose = (code: number | null): void => {
      if (canceledByUser) {
        finalize({ success: false, error: 'Generation canceled.', canceled: true })
        return
      }
      if (outputLimitExceeded) {
        finalize({
          success: false,
          error: `${label} CLI command produced too much output. Check the agent CLI configuration and try again.`
        })
        return
      }
      finalizeFromAgentOutput({
        code,
        stdout,
        stderr,
        label,
        emptyResultName,
        finalize,
        includeStdoutDetail: operation !== 'branch-name'
      })
    }
    child.stdout?.on('data', onStdoutData)
    child.stderr?.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
    detachChildListeners = () => {
      child.stdout?.off?.('data', onStdoutData)
      child.stderr?.off?.('data', onStderrData)
      child.off?.('error', onError)
      child.off?.('close', onClose)
    }

    child.stdin?.end(stdinPayload ?? undefined)
  })
}

export function cancelLocalTextGeneration(operation: TextGenerationOperation, cwd: string): void {
  cancelTokensByLane.get(localLaneKey(operation, cwd))?.()
}
