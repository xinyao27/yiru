import { existsSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

import { getYiruCliCommandNameForPlatform } from '~shared/yiru-cli-command-name'

import { escapeWindowsBatchValue, isAbsoluteForPlatform, quoteShell } from './installer-path'

const PRODUCTION_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux')
const DEV_COMMAND_NAME = getYiruCliCommandNameForPlatform('linux', 'development')
const LINUX_COMMAND_NAME = PRODUCTION_COMMAND_NAME
const DEV_LAUNCHER_DIR = ['cli', 'bin']

export async function ensureDevLauncher(args: {
  platform: NodeJS.Platform
  userDataPath: string
  execPath: string
  cliEntryPath: string
  commandName: string
}): Promise<string | null> {
  if (
    !isAbsoluteForPlatform(args.platform, args.execPath) ||
    !isAbsolute(args.cliEntryPath) ||
    !existsSync(args.cliEntryPath)
  ) {
    return null
  }

  const launcherPath = join(
    args.userDataPath,
    ...DEV_LAUNCHER_DIR,
    args.platform === 'win32' ? `${args.commandName}.cmd` : args.commandName
  )
  await mkdir(dirname(launcherPath), { recursive: true })

  // Why: packaged Yiru ships real platform launchers under resources/bin, but
  // development builds do not have that stable asset layout. Generating a
  // launcher in userData lets us validate the shell-command flow without
  // changing the packaged registration contract.
  const content =
    args.platform === 'win32'
      ? buildWindowsDevLauncher(args.execPath, args.cliEntryPath, args.userDataPath)
      : buildUnixDevLauncher(args.execPath, args.cliEntryPath, args.userDataPath, args.commandName)
  await writeFile(launcherPath, content, {
    encoding: 'utf8',
    mode: args.platform === 'win32' ? undefined : 0o755
  })
  if (args.commandName === DEV_COMMAND_NAME && args.platform !== 'win32') {
    // Why: older dev builds wrote a production-name alias into this
    // product-owned directory. Leaving it behind would keep shadowing the real
    // production CLI even after new builds stop creating the alias.
    try {
      await unlink(join(dirname(launcherPath), PRODUCTION_COMMAND_NAME))
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
    }
  }
  return launcherPath
}

function buildUnixDevLauncher(
  execPathValue: string,
  cliEntryPath: string,
  userDataPath: string,
  commandName: string
): string {
  return `#!/usr/bin/env bash
set -euo pipefail
ELECTRON=${quoteShell(execPathValue)}
CLI=${quoteShell(cliEntryPath)}
export YIRU_USER_DATA_PATH=${quoteShell(userDataPath)}
export YIRU_CLI_COMMAND=${quoteShell(commandName)}
export YIRU_CLI_ENVIRONMENT=development
if [ -z "\${YIRU_APP_EXECUTABLE:-}" ]; then
  export YIRU_APP_EXECUTABLE="$ELECTRON"
  export YIRU_APP_EXECUTABLE_NEEDS_APP_ROOT=1
fi
export YIRU_NODE_OPTIONS="\${NODE_OPTIONS-}"
export YIRU_NODE_REPL_EXTERNAL_MODULE="\${NODE_REPL_EXTERNAL_MODULE-}"
unset NODE_OPTIONS
unset NODE_REPL_EXTERNAL_MODULE
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
`
}

function buildWindowsDevLauncher(
  execPathValue: string,
  cliEntryPath: string,
  userDataPath: string
): string {
  return `@echo off
setlocal
set "ELECTRON=${escapeWindowsBatchValue(execPathValue)}"
set "CLI=${escapeWindowsBatchValue(cliEntryPath)}"
set "YIRU_USER_DATA_PATH=${escapeWindowsBatchValue(userDataPath)}"
set "YIRU_CLI_COMMAND=${getYiruCliCommandNameForPlatform('win32', 'development')}"
set "YIRU_CLI_ENVIRONMENT=development"
if not defined YIRU_APP_EXECUTABLE (
  set "YIRU_APP_EXECUTABLE=%ELECTRON%"
  set "YIRU_APP_EXECUTABLE_NEEDS_APP_ROOT=1"
)
set "YIRU_NODE_OPTIONS=%NODE_OPTIONS%"
set "YIRU_NODE_REPL_EXTERNAL_MODULE=%NODE_REPL_EXTERNAL_MODULE%"
set NODE_OPTIONS=
set NODE_REPL_EXTERNAL_MODULE=
set ELECTRON_RUN_AS_NODE=1
"%ELECTRON%" "%CLI%" %*
`
}

export function buildWindowsForwarder(launcherPath: string): string {
  return `@echo off
setlocal
set "YIRU_LAUNCHER=${escapeWindowsBatchValue(launcherPath)}"
"%YIRU_LAUNCHER%" %*
`
}

export function extractManagedUnixLauncherTarget(content: string): string | null {
  if (
    !content.includes('ELECTRON_RUN_AS_NODE=1') ||
    !content.includes('YIRU_NODE_OPTIONS') ||
    !content.includes('NODE_REPL_EXTERNAL_MODULE')
  ) {
    return null
  }

  const cliPath = extractShellAssignment(content, 'CLI')
  if (!cliPath) {
    return null
  }

  // Why: older dev installs wrote a generated shell launcher directly to
  // /usr/local/bin/yiru. Treat only Yiru's compiled CLI entrypoints as managed;
  // arbitrary user scripts that happen to launch Electron must stay conflicts.
  return /(?:^|[/\\])(?:out|app\.asar\.unpacked[/\\]out)[/\\]cli[/\\]index\.js$/.test(cliPath)
    ? cliPath
    : null
}

function extractShellAssignment(content: string, name: string): string | null {
  const match = new RegExp(`^${name}=('([^']*)'|"([^"]*)"|([^\\n]+))$`, 'm').exec(content)
  if (!match) {
    return null
  }
  return (match[2] ?? match[3] ?? match[4] ?? '').trim()
}

export function getBundledLauncherPath(
  platform: NodeJS.Platform,
  resourcesPath: string
): string | null {
  if (platform === 'darwin') {
    return join(resourcesPath, 'bin', PRODUCTION_COMMAND_NAME)
  }
  if (platform === 'linux') {
    return join(resourcesPath, 'bin', LINUX_COMMAND_NAME)
  }
  if (platform === 'win32') {
    return join(resourcesPath, 'bin', 'yiru.exe')
  }
  return null
}
