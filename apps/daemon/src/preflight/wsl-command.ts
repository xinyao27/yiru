import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows
} from '@yiru/runtime-protocol/workbench/wsl-login-shell-command'

import type { WslPreflightTarget } from './wsl-agent-detection'

export type PreflightWslCommandResult = { stdout: string; stderr: string }

export async function runPreflightCommandInWsl(
  target: WslPreflightTarget,
  command: string,
  timeoutMs: number
): Promise<PreflightWslCommandResult> {
  const distroArgs = target.distro ? ['-d', target.distro] : []
  const child = Bun.spawn(
    [
      'wsl.exe',
      ...distroArgs,
      '--',
      'sh',
      '-c',
      escapeWslShCommandForWindows(buildWslLoginShellCommand(command))
    ],
    {
      signal: AbortSignal.timeout(timeoutMs),
      stderr: 'pipe',
      stdout: 'pipe'
    }
  )
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text()
  ])
  if (exitCode !== 0) {
    throw Object.assign(new Error(stderr.trim() || stdout.trim() || 'wsl.exe failed'), {
      code: exitCode,
      stderr,
      stdout
    })
  }
  return { stderr, stdout }
}
