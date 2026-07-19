import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export function locateTailscaleCli(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const executableNames = platform === 'win32' ? windowsExecutableNames(env) : ['tailscale']
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const executableName of executableNames) {
      const candidate = join(directory, executableName)
      if (isExecutableFile(candidate, platform)) {
        return candidate
      }
    }
  }

  for (const candidate of standardTailscaleLocations(platform, env)) {
    if (isExecutableFile(candidate, platform)) {
      return candidate
    }
  }
  return null
}

function windowsExecutableNames(env: NodeJS.ProcessEnv): string[] {
  const extensions = (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .filter(Boolean)
    .map((extension) => extension.toLowerCase())
  return ['tailscale', ...extensions.map((extension) => `tailscale${extension}`)]
}

function standardTailscaleLocations(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
      '/opt/homebrew/bin/tailscale',
      '/usr/local/bin/tailscale',
      '/usr/bin/tailscale'
    ]
  }
  if (platform === 'win32') {
    return [
      ...(env.ProgramFiles ? [join(env.ProgramFiles, 'Tailscale', 'tailscale.exe')] : []),
      ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Tailscale', 'tailscale.exe')] : [])
    ]
  }
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/snap/bin/tailscale']
}

function isExecutableFile(candidate: string, platform: NodeJS.Platform): boolean {
  if (!existsSync(candidate)) {
    return false
  }
  try {
    if (!statSync(candidate).isFile()) {
      return false
    }
    if (platform !== 'win32') {
      accessSync(candidate, constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}
