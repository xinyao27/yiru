import { execFile } from 'node:child_process'

import { quoteShell } from './wsl-cli-scripts'

const WSL_COMMAND_TIMEOUT_MS = 10_000

export async function runWslCommand(distro: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof execFile> | null = null
    let settled = false

    const finish = (error: Error | null, stdout = ''): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
      } else {
        resolve(stdout)
      }
    }

    // Why: Settings must not remain pending behind a wedged wsl.exe process.
    const timeout = setTimeout(() => {
      child?.kill()
      finish(new Error(`WSL command timed out after ${WSL_COMMAND_TIMEOUT_MS}ms.`))
    }, WSL_COMMAND_TIMEOUT_MS)

    try {
      child = execFile(
        'wsl.exe',
        ['-d', distro, '--', 'bash', '-lc', buildEncodedWslBashCommand(command)],
        { encoding: 'utf8', timeout: WSL_COMMAND_TIMEOUT_MS },
        (error, stdout) => finish(error ?? null, stdout)
      )
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function buildEncodedWslBashCommand(command: string): string {
  // Why: multiline heredocs can be flattened across wsl.exe's Windows command line.
  const encoded = Buffer.from(command, 'utf8').toString('base64')
  return `set -o pipefail; printf %s ${quoteShell(encoded)} | base64 -d | bash`
}
