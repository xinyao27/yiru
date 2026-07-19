import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { getSpawnArgsForWindows, resolveWindowsCommand } from './win32-utils'

export function spawnLocalLanguageServer(
  command: string,
  args: string[],
  cwd: string
): ChildProcessWithoutNullStreams {
  const env = buildLanguageServerEnvironment()
  const spawnConfig =
    process.platform === 'win32'
      ? getSpawnArgsForWindows(resolveWindowsCommand(command, env), args)
      : { spawnCmd: command, spawnArgs: args }
  return spawn(spawnConfig.spawnCmd, spawnConfig.spawnArgs, {
    cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: 'pipe',
    windowsHide: true
  }) as ChildProcessWithoutNullStreams
}

export function waitForLanguageServerSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
}

export function writeLanguageServerFrame(
  child: ChildProcessWithoutNullStreams,
  frame: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    child.stdin.write(frame, (error) => (error ? reject(error) : resolve()))
  })
}

export function killLanguageServerProcess(
  child: ChildProcessWithoutNullStreams,
  force = false
): void {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], {
      stdio: 'ignore',
      windowsHide: true
    }).unref()
    return
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
  } catch {
    child.kill(force ? 'SIGKILL' : 'SIGTERM')
  }
}

function buildLanguageServerEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'Path',
    'PATHEXT',
    'HOME',
    'USER',
    'LOGNAME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'USERNAME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'WINDIR',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
    'LC_ALL',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS'
  ]
  return Object.fromEntries(
    allowed.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))
  )
}
