import { spawn } from 'node:child_process'

import { parseWslUncPath } from '@yiru/runtime-protocol/model/platform'
import type { ProviderRateLimits } from '@yiru/runtime-protocol/workbench/rate-limit-types'
import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows
} from '@yiru/runtime-protocol/workbench/wsl-login-shell-command'

import { withMacTailscaleDnsHint } from '../network/macos-tailscale-dns-diagnostic'
import { getSpawnArgsForWindows } from '../platform/windows-host'
import { resolveCodexCommand } from '../runtime/cli-command'
import {
  getHiddenRateLimitWslCwdSetupCommands,
  resolveHiddenRateLimitPtyCwd
} from '../runtime/hidden-rate-limit-pty-cwd'
import type { RpcRateLimitsResponse } from './codex-rate-limit-contracts'
import { abortedCodexRateLimitResult, mapRpcWindow } from './codex-rate-limit-mapping'
import type { FetchCodexRateLimitsOptions } from './codex-rate-limit-options'
import {
  classifyCodexRateLimitWindows,
  CODEX_SESSION_WINDOW_MINUTES,
  CODEX_WEEKLY_WINDOW_MINUTES
} from './codex-rate-limit-window-classification'
import { mapRpcRateLimitResetCredits } from './codex-reset-credits'

const RPC_TIMEOUT_MS = 10000
const WSL_RPC_TIMEOUT_MS = 25000
const MAX_DIAGNOSTIC_OUTPUT_LENGTH = 100000

type RpcResponse = {
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

export async function fetchCodexRateLimitsViaRpc(
  options?: FetchCodexRateLimitsOptions
): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedCodexRateLimitResult()
  }
  return new Promise((resolve) => {
    const codexArgs = ['-s', 'read-only', 'app-server']
    const wslCodex = options?.codexHomePath
      ? buildWslCodexCommand(options.codexHomePath, codexArgs)
      : null
    const codexCommand = wslCodex ? 'codex' : resolveCodexCommand()
    const { spawnCmd, spawnArgs } = wslCodex
      ? { spawnCmd: wslCodex.command, spawnArgs: wslCodex.args }
      : getSpawnArgsForWindows(codexCommand, codexArgs)
    const child = spawn(spawnCmd, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: resolveHiddenRateLimitPtyCwd(),
      windowsHide: true,
      env: {
        ...(wslCodex ? processEnvWithoutCodexHome() : process.env),
        ...(options?.codexHomePath && !wslCodex ? { CODEX_HOME: options.codexHomePath } : {})
      }
    })
    let buffer = ''
    let stderr = ''
    let isSettled = false
    let rpcId = 0
    let timeout: ReturnType<typeof setTimeout> | null = null
    let rateLimitsId: number | null = null

    const cleanupListeners = (): void => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      options?.signal?.removeEventListener('abort', onAbort)
      child.stdout.off('data', onStdoutData)
      child.stderr.off('data', onStderrData)
      child.off('error', onError)
      child.off('close', onClose)
    }
    const settle = (result: ProviderRateLimits, shouldKill = false): void => {
      if (isSettled) {
        return
      }
      isSettled = true
      cleanupListeners()
      if (shouldKill) {
        child.kill()
      }
      resolve(result)
    }
    const sendRpc = (method: string, params?: unknown): number => {
      const id = ++rpcId
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })}\n`)
      return id
    }
    const sendNotification = (method: string): void => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params: {} })}\n`)
    }
    const onAbort = (): void => settle(abortedCodexRateLimitResult(), true)
    const onStdoutData = (chunk: Buffer): void => {
      buffer += chunk.toString()
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          handleRpcLine(line)
        }
      }
    }
    const handleRpcLine = (line: string): void => {
      try {
        const message = JSON.parse(line) as RpcResponse
        if (message.id === initId) {
          sendNotification('initialized')
          rateLimitsId = sendRpc('account/rateLimits/read')
        } else if (rateLimitsId !== null && message.id === rateLimitsId) {
          settle(mapRpcResponse(message, stderr), true)
        }
      } catch {
        // Why: app-server startup may emit non-JSON diagnostics on stdout.
      }
    }
    const onStderrData = (chunk: Buffer): void => {
      stderr += chunk.toString()
      if (stderr.length > MAX_DIAGNOSTIC_OUTPUT_LENGTH) {
        stderr = stderr.slice(-MAX_DIAGNOSTIC_OUTPUT_LENGTH)
      }
    }
    const onError = (error: Error): void => {
      const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT'
      const isBareCommand = codexCommand === 'codex'
      settle({
        provider: 'codex',
        session: null,
        weekly: null,
        updatedAt: Date.now(),
        error: isEnoent
          ? isBareCommand
            ? 'Codex CLI not found'
            : 'Codex CLI found but could not run — Node.js may not be in your PATH'
          : withMacTailscaleDnsHint(error.message, stderr),
        status: isEnoent && isBareCommand ? 'unavailable' : 'error'
      })
    }
    const onClose = (): void => {
      settle({
        provider: 'codex',
        session: null,
        weekly: null,
        updatedAt: Date.now(),
        error: withMacTailscaleDnsHint('RPC process exited unexpectedly', stderr),
        status: 'error'
      })
    }

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort()
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }
    timeout = setTimeout(
      () =>
        settle(
          {
            provider: 'codex',
            session: null,
            weekly: null,
            updatedAt: Date.now(),
            error: 'RPC timeout',
            status: 'error'
          },
          true
        ),
      wslCodex ? WSL_RPC_TIMEOUT_MS : RPC_TIMEOUT_MS
    )
    const initId = sendRpc('initialize', {
      clientInfo: { name: 'yiru', version: '1.0.0' }
    })
    child.stdout.on('data', onStdoutData)
    child.stderr.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
  })
}

function mapRpcResponse(message: RpcResponse, stderr: string): ProviderRateLimits {
  if (message.error) {
    return {
      provider: 'codex',
      session: null,
      weekly: null,
      updatedAt: Date.now(),
      error: withMacTailscaleDnsHint(message.error.message, stderr),
      status: 'error'
    }
  }
  const wrapper = message.result as RpcRateLimitsResponse | undefined
  const classified = classifyCodexRateLimitWindows(
    wrapper?.rateLimits,
    wrapper?.rateLimitsByLimitId
  )
  const resetCredits = mapRpcRateLimitResetCredits(wrapper?.rateLimitResetCredits)
  return {
    provider: 'codex',
    session: mapRpcWindow(classified.session, CODEX_SESSION_WINDOW_MINUTES),
    weekly: mapRpcWindow(classified.weekly, CODEX_WEEKLY_WINDOW_MINUTES),
    ...(resetCredits !== undefined ? { rateLimitResetCredits: resetCredits } : {}),
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

function buildWslCodexCommand(
  codexHomePath: string,
  args: string[]
): { command: string; args: string[] } | null {
  const wslInfo = parseWslUncPath(codexHomePath)
  if (process.platform !== 'win32' || !wslInfo) {
    return null
  }
  const setup = [
    ...getHiddenRateLimitWslCwdSetupCommands(),
    `export CODEX_HOME=${shellQuote(wslInfo.linuxPath)}`
  ].join(' && ')
  const execSuffix = `${args.map(shellQuote).join(' ')} <&3 >&4 3<&- 4>&-`
  const loginShellCommand = buildWslLoginShellCommand(
    [setup, `exec codex ${execSuffix}`].join(' && ')
  )
  const command = [
    'exec 3<&0',
    'exec 4>&1',
    'exec </dev/null',
    'exec >/dev/null',
    loginShellCommand
  ].join('\n')
  return {
    command: 'wsl.exe',
    args: ['-d', wslInfo.distro, '--', 'sh', '-c', escapeWslShCommandForWindows(command)]
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function processEnvWithoutCodexHome(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CODEX_HOME
  return env
}
