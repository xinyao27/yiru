import { spawn } from 'node:child_process'

import { resolveClaudeCommand } from '~main/runtime/cli-command'

const MAX_COMMAND_OUTPUT_CHARS = 4_000
const CLAUDE_AUTH_DENIED_PATTERN =
  /\baccess_denied\b|authorization (?:request )?(?:was )?denied|sign-?in (?:was )?denied|login (?:was )?denied/i

export type ClaudeLoginConfigDir = {
  windowsPath: string
  linuxPath: string | null
  wslDistro: string | null
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function runClaudeCommand(
  args: string[],
  configDir: ClaudeLoginConfigDir,
  timeoutMs: number,
  options?: { allowFailure?: boolean; signal?: AbortSignal; keepStdinOpen?: boolean }
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const spawnConfig =
      configDir.linuxPath && configDir.wslDistro
        ? {
            command: 'wsl.exe',
            args: [
              '-d',
              configDir.wslDistro,
              '--',
              'bash',
              '-lc',
              `export CLAUDE_CONFIG_DIR=${shellQuote(configDir.linuxPath)}; exec claude ${args.map(shellQuote).join(' ')}`
            ],
            env: process.env,
            shell: false
          }
        : {
            command: resolveClaudeCommand(),
            args,
            env: { ...process.env, CLAUDE_CONFIG_DIR: configDir.windowsPath },
            shell: process.platform === 'win32'
          }
    const child = spawn(spawnConfig.command, spawnConfig.args, {
      stdio: [options?.keepStdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: spawnConfig.shell,
      env: spawnConfig.env,
      // Why: cancellation must terminate browser/login descendants too.
      detached: process.platform !== 'win32'
    })
    const stdout = child.stdout
    const stderr = child.stderr
    if (!stdout || !stderr) {
      if (options?.keepStdinOpen) {
        child.stdin?.destroy()
      }
      child.kill()
      rejectPromise(new Error('Claude command failed to open output streams.'))
      return
    }

    let settled = false
    let output = ''
    let timeout: ReturnType<typeof setTimeout> | null = null
    const killChild = (): void => {
      if (process.platform === 'win32' && child.pid) {
        const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true
        })
        taskkill.on('error', () => {})
        taskkill.unref()
        return
      }
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid)
          return
        } catch {
          // Fall back when the process group is unavailable.
        }
      }
      child.kill()
    }
    const appendOutput = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`
      if (output.length > MAX_COMMAND_OUTPUT_CHARS) {
        output = output.slice(-MAX_COMMAND_OUTPUT_CHARS)
      }
      if (CLAUDE_AUTH_DENIED_PATTERN.test(output)) {
        killChild()
        settle(() => rejectPromise(new Error('Claude sign-in was denied. Please try again.')))
      }
    }
    const cleanup = (): void => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      stdout.off('data', appendOutput)
      stderr.off('data', appendOutput)
      child.off('error', onError)
      child.off('close', onClose)
      options?.signal?.removeEventListener('abort', onAbort)
      if (options?.keepStdinOpen) {
        child.stdin?.destroy()
      }
    }
    const settle = (callback: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }
    const onAbort = (): void => {
      killChild()
      settle(() => rejectPromise(new Error('Claude sign-in was cancelled.')))
    }
    const onError = (error: Error): void => settle(() => rejectPromise(error))
    const onClose = (code: number | null): void => {
      settle(() => {
        if (code === 0 || options?.allowFailure) {
          resolvePromise(output)
          return
        }
        const trimmedOutput = output.trim()
        rejectPromise(
          new Error(
            trimmedOutput
              ? `Claude command failed: ${trimmedOutput}`
              : `Claude command exited with code ${code ?? 'unknown'}.`
          )
        )
      })
    }
    timeout = setTimeout(() => {
      killChild()
      settle(() => rejectPromise(new Error('Claude sign-in took too long to finish.')))
    }, timeoutMs)
    stdout.on('data', appendOutput)
    stderr.on('data', appendOutput)
    child.on('error', onError)
    child.on('close', onClose)
    if (options?.signal?.aborted) {
      onAbort()
    } else {
      options?.signal?.addEventListener('abort', onAbort, { once: true })
    }
  })
}
