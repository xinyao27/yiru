import { execFile } from 'node:child_process'

const INSPECT_TIMEOUT_MS = 5_000

type WslPathInspection = {
  path: string
  type: 'file' | 'directory' | 'other'
}

export async function inspectWslLanguageServerPath(
  distro: string,
  linuxPath: string
): Promise<WslPathInspection> {
  if (!distro.trim() || !linuxPath.startsWith('/') || linuxPath.includes('\0')) {
    throw new Error('Language server requires a valid WSL path.')
  }
  const script = [
    'resolved=$(readlink -f -- "$1") || exit 2',
    'if [ -f "$resolved" ]; then kind=file',
    'elif [ -d "$resolved" ]; then kind=directory',
    'else kind=other; fi',
    'printf "%s\\n%s" "$kind" "$resolved"'
  ].join('; ')
  const output = await execWsl(distro, ['sh', '-c', script, 'yiru-lsp-path', linuxPath])
  const newline = output.indexOf('\n')
  if (newline <= 0) {
    throw new Error('Unable to inspect the WSL language server path.')
  }
  const type = output.slice(0, newline)
  const resolvedPath = output.slice(newline + 1).trimEnd()
  if (
    (type !== 'file' && type !== 'directory' && type !== 'other') ||
    !resolvedPath.startsWith('/')
  ) {
    throw new Error('Unable to inspect the WSL language server path.')
  }
  return { path: resolvedPath, type }
}

function execWsl(distro: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      ['-d', distro, '--', ...args],
      {
        encoding: 'utf8',
        timeout: INSPECT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 64 * 1024
      },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Unable to inspect WSL workspace: ${error.message}`))
          return
        }
        resolve(stdout)
      }
    )
  })
}
