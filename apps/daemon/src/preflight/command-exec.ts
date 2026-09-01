import path from 'node:path'

import { buildPosixCommandPathLookupScript } from '~main/posix-command-path-lookup'

import { buildLocalPreflightEnv } from './local-env'
import type { WslPreflightTarget } from './wsl-agent-detection'
import { runPreflightCommandInWsl } from './wsl-command'

export const PREFLIGHT_COMMAND_TIMEOUT_MS = 5000
const WSL_COMMAND_PATH_SENTINEL = '__YIRU_PREFLIGHT_COMMAND_PATH__'

export type PreflightCommandResult = { stdout: string; stderr: string }

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export async function execLocalPreflightCommand(
  command: string,
  args: string[]
): Promise<PreflightCommandResult> {
  const env = buildLocalPreflightEnv()
  const child = Bun.spawn([command, ...args], {
    env: { ...process.env, ...env },
    signal: AbortSignal.timeout(PREFLIGHT_COMMAND_TIMEOUT_MS),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text()
  ])
  if (exitCode !== 0) {
    throw Object.assign(new Error(stderr.trim() || stdout.trim() || `${command} failed`), {
      code: exitCode,
      stderr,
      stdout
    })
  }
  return { stderr, stdout }
}

export async function execCommandInWsl(
  target: WslPreflightTarget,
  command: string
): Promise<PreflightCommandResult> {
  return runPreflightCommandInWsl(target, command, PREFLIGHT_COMMAND_TIMEOUT_MS)
}

export async function isCommandAvailable(
  command: string,
  wslTarget?: WslPreflightTarget
): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWsl(wslTarget, `${shellQuote(command)} --version`)
      : execLocalPreflightCommand(command, ['--version']))
    return true
  } catch {
    return false
  }
}

export async function isCommandOnPath(
  command: string,
  wslTarget?: WslPreflightTarget
): Promise<boolean> {
  const finder = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = wslTarget
      ? // Why: preflight must validate the executable on PATH, not a shell alias or function.
        await execCommandInWsl(
          wslTarget,
          [
            buildPosixCommandPathLookupScript({ kind: 'literal', value: command }),
            'if [ -n "$resolved" ]; then',
            `printf '${WSL_COMMAND_PATH_SENTINEL}%s\\n' "$resolved"`,
            'fi'
          ].join('\n')
        )
      : await execLocalPreflightCommand(finder, [command])
    if (wslTarget) {
      // Why: WSL startup chatter can contain unrelated absolute paths.
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith(WSL_COMMAND_PATH_SENTINEL))
        .map((line) => line.slice(WSL_COMMAND_PATH_SENTINEL.length))
        .some((line) => path.posix.isAbsolute(line))
    }

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => path.isAbsolute(line))
  } catch {
    return false
  }
}
