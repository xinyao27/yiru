import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { resolveCodexCommand } from '~main/runtime/cli-command'
import { getSpawnArgsForWindows } from '~main/windows-host'

import {
  buildWslCodexAvailabilityArgs,
  buildWslCodexLoginArgs,
  WSL_CODEX_AVAILABILITY_TIMEOUT_MS
} from './wsl-codex-command'

const LOGIN_TIMEOUT_MS = 120_000
const MAX_LOGIN_OUTPUT_CHARS = 4_000
const WINDOWS_LOGIN_AUTH_POLL_INTERVAL_MS = 500
const WINDOWS_LOGIN_POST_AUTH_EXIT_GRACE_MS = 5_000
const WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS = 5_000

function killLoginProcessTree(child: ChildProcess): void {
  if (
    process.platform === 'win32' &&
    typeof child.pid === 'number' &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        timeout: WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS,
        stdio: 'ignore'
      })
      return
    } catch {
      // Why: taskkill can race an already-exited tree; the direct child still
      // needs the ordinary signal as a bounded fallback.
    }
  }
  child.kill()
}

function readLoginAuthSnapshot(path: string): string | null | undefined {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? null : undefined
  }
}

function loginAuthChanged(
  initial: string | null | undefined,
  current: string | null | undefined
): boolean {
  return initial !== undefined && current !== undefined && current !== null && current !== initial
}

export class CodexAccountLogin {
  async run(managedHomePath: string): Promise<void> {
    const wslInfo = parseWslUncPath(managedHomePath)
    if (wslInfo) {
      this.assertWslCodexCliAvailable(wslInfo)
    }
    const initialAuthSnapshot = wslInfo
      ? null
      : readLoginAuthSnapshot(join(managedHomePath, 'auth.json'))

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const spawnConfig = wslInfo
        ? {
            command: 'wsl.exe',
            args: buildWslCodexLoginArgs(wslInfo.distro, wslInfo.linuxPath),
            env: process.env,
            codexCommand: 'codex'
          }
        : (() => {
            const codexCommand = resolveCodexCommand()
            // Why: on Windows, resolveCodexCommand() may return a .cmd/.bat file
            // (e.g. codex.cmd from npm). Node's child_process.spawn cannot execute
            // batch scripts directly without shell:true, but shell:true with an args
            // array causes DEP0190 because args are concatenated, not escaped.
            // Fix: detect batch scripts and invoke cmd.exe /c explicitly.
            const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(codexCommand, ['login'])
            return {
              command: spawnCmd,
              args: spawnArgs,
              env: {
                ...process.env,
                CODEX_HOME: managedHomePath
              },
              codexCommand
            }
          })()
      const child = spawn(spawnConfig.command, spawnConfig.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Why: route through cmd.exe for .cmd/.bat entrypoints would otherwise
        // flash a console window in the packaged GUI app on Windows.
        windowsHide: true,
        env: spawnConfig.env
      })

      let settled = false
      let output = ''
      const appendOutput = (chunk: Buffer): void => {
        output = `${output}${chunk.toString()}`
        if (output.length > MAX_LOGIN_OUTPUT_CHARS) {
          output = output.slice(-MAX_LOGIN_OUTPUT_CHARS)
        }
      }

      let timeout: ReturnType<typeof setTimeout> | null = null
      let authWatchInterval: ReturnType<typeof setInterval> | null = null
      let postAuthExitTimeout: ReturnType<typeof setTimeout> | null = null
      let loginTreeKilledAfterAuth = false
      const authJsonPath = join(managedHomePath, 'auth.json')
      const cleanupListeners = (): void => {
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        if (authWatchInterval) {
          clearInterval(authWatchInterval)
          authWatchInterval = null
        }
        if (postAuthExitTimeout) {
          clearTimeout(postAuthExitTimeout)
          postAuthExitTimeout = null
        }
        child.stdout.off('data', appendOutput)
        child.stderr.off('data', appendOutput)
        child.off('error', onError)
        child.off('close', onClose)
      }

      const settle = (callback: () => void): void => {
        if (settled) {
          return
        }
        settled = true
        cleanupListeners()
        callback()
      }

      const timeoutError = new Error('Codex sign-in took too long to finish. Please try again.')
      timeout = setTimeout(() => {
        killLoginProcessTree(child)
        settle(() => {
          rejectPromise(timeoutError)
        })
      }, LOGIN_TIMEOUT_MS)

      if (process.platform === 'win32' && !wslInfo) {
        authWatchInterval = setInterval(() => {
          if (!loginAuthChanged(initialAuthSnapshot, readLoginAuthSnapshot(authJsonPath))) {
            return
          }
          if (authWatchInterval) {
            clearInterval(authWatchInterval)
            authWatchInterval = null
          }
          postAuthExitTimeout = setTimeout(() => {
            loginTreeKilledAfterAuth = true
            killLoginProcessTree(child)
          }, WINDOWS_LOGIN_POST_AUTH_EXIT_GRACE_MS)
        }, WINDOWS_LOGIN_AUTH_POLL_INTERVAL_MS)
      }

      const onError = (error: Error): void => {
        settle(() => {
          const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT'
          // Why: ENOENT can mean either the codex binary doesn't exist OR the
          // script's shebang interpreter (node) isn't in PATH. When we resolved
          // codex to a full path, ENOENT almost certainly means node is missing.
          const isBareCommand = spawnConfig.codexCommand === 'codex'
          const message = isEnoent
            ? isBareCommand
              ? 'Codex CLI not found.'
              : 'Codex CLI found but could not run — Node.js may not be in your PATH.'
            : error.message
          rejectPromise(new Error(message))
        })
      }

      const onClose = (code: number | null): void => {
        settle(() => {
          if (code === 0 || (loginTreeKilledAfterAuth && existsSync(authJsonPath))) {
            resolvePromise()
            return
          }
          const trimmedOutput = output.trim()
          rejectPromise(
            new Error(
              trimmedOutput
                ? `Codex login failed: ${trimmedOutput}`
                : `Codex login exited with code ${code ?? 'unknown'}.`
            )
          )
        })
      }

      child.stdout.on('data', appendOutput)
      child.stderr.on('data', appendOutput)
      child.on('error', onError)
      child.on('close', onClose)
    })
  }

  private assertWslCodexCliAvailable(wslInfo: { distro: string; linuxPath: string }): void {
    try {
      execFileSync('wsl.exe', buildWslCodexAvailabilityArgs(wslInfo.distro), {
        encoding: 'utf-8',
        timeout: WSL_CODEX_AVAILABILITY_TIMEOUT_MS
      })
    } catch (error) {
      throw new Error(
        `Codex CLI is not available in WSL ${wslInfo.distro}. Install Codex in that distro or switch Account location to Windows.`,
        { cause: error }
      )
    }
  }
}
