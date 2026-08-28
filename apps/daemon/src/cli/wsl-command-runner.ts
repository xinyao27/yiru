import { captureSubprocess } from '../subprocess-capture'
import { quoteShell } from './wsl-cli-scripts'

const WSL_COMMAND_TIMEOUT_MS = 10_000

export async function runWslCommand(distro: string, command: string): Promise<string> {
  // Why: Settings must not remain pending behind a wedged wsl.exe process.
  const { stdout } = await captureSubprocess(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-lc', buildEncodedWslBashCommand(command)],
    { timeoutMs: WSL_COMMAND_TIMEOUT_MS }
  )
  return stdout.toString()
}

function buildEncodedWslBashCommand(command: string): string {
  // Why: multiline heredocs can be flattened across wsl.exe's Windows command line.
  const encoded = Buffer.from(command, 'utf8').toString('base64')
  return `set -o pipefail; printf %s ${quoteShell(encoded)} | base64 -d | bash`
}
