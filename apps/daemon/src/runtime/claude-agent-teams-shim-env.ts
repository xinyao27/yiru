import { accessSync, constants, existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import {
  addClaudeTeammateModeAuto,
  addClaudeTeammateModeInProcess,
  isDirectClaudeCommand,
  type ClaudeAgentTeamsMode
} from '@yiru/runtime-protocol/workbench/claude-agent-teams-tmux-compat'
import { resolveYiruCliCommandName } from '@yiru/runtime-protocol/workbench/yiru-cli-command-name'

import { getRuntimeHostPathsProvider } from './host/paths-provider'

export type ClaudeAgentTeamsLaunchPlan = {
  command: string
  env: Record<string, string>
  envToDelete?: string[]
}

export async function ensureClaudeAgentTeamsShimDir(root = defaultShimRoot()): Promise<string> {
  await mkdir(root, { recursive: true })
  await writeIfChanged(join(root, 'tmux'), unixShimScript())
  if (process.platform === 'win32') {
    await writeIfChanged(join(root, 'tmux.cmd'), windowsShimScript())
  }
  return root
}

export async function buildClaudeAgentTeamsLaunchPlan(args: {
  command: string | undefined
  mode: ClaudeAgentTeamsMode | undefined
  baseEnv: Record<string, string | undefined>
  createTeamEnv: (shimDir: string, shimBin: string) => Record<string, string>
}): Promise<ClaudeAgentTeamsLaunchPlan | null> {
  const mode = args.mode ?? 'off'
  if (!args.command || mode === 'off' || !isDirectClaudeCommand(args.command)) {
    return null
  }
  if (mode === 'in-process' || process.platform === 'win32') {
    return {
      command: addClaudeTeammateModeInProcess(args.command),
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' }
    }
  }
  const shimDir = await ensureClaudeAgentTeamsShimDir()
  const shimBin = resolveClaudeAgentTeamsShimBin(args.baseEnv)
  const env = args.createTeamEnv(shimDir, shimBin)
  return {
    command: addClaudeTeammateModeAuto(args.command),
    env,
    envToDelete: ['TERM_PROGRAM', 'YIRU_ATTRIBUTION_SHIM_DIR']
  }
}

export function resolveClaudeAgentTeamsShimBin(
  env: Record<string, string | undefined> = process.env
): string {
  if (env.YIRU_AGENT_TEAMS_SHIM_BIN) {
    return env.YIRU_AGENT_TEAMS_SHIM_BIN
  }
  const commandName = resolveYiruCliCommandName({
    configuredCommand: env.YIRU_CLI_COMMAND,
    environment: 'production',
    platform: process.platform
  })
  const executableOnPath = findExecutableOnPath(commandName, env.PATH)
  if (executableOnPath) {
    return executableOnPath
  }
  const productionCommandName = resolveYiruCliCommandName({
    environment: 'production',
    platform: process.platform
  })
  const bundled = commandName === productionCommandName ? bundledLauncherPath() : null
  return bundled && isExecutableFile(bundled) ? bundled : commandName
}

function defaultShimRoot(): string {
  return join(homedir(), '.yiru', 'claude-agent-teams-bin')
}

function bundledLauncherPath(): string | null {
  const resourcesPath = getRuntimeHostPathsProvider().resourcesPath()
  if (!resourcesPath) {
    return null
  }
  if (process.platform === 'darwin') {
    return join(resourcesPath, 'bin', 'yiru')
  }
  if (process.platform === 'linux') {
    return join(resourcesPath, 'bin', 'yiru')
  }
  if (process.platform === 'win32') {
    return join(resourcesPath, 'bin', 'yiru.exe')
  }
  return null
}

function findExecutableOnPath(command: string, pathValue: string | undefined): string | null {
  for (const directory of pathValue?.split(delimiter) ?? []) {
    if (!directory) {
      continue
    }
    const candidate = join(directory, command)
    if (isExecutableFile(candidate)) {
      return candidate
    }
  }
  return null
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!existsSync(candidate)) {
      return false
    }
    accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

function unixShimScript(): string {
  const commandName = resolveYiruCliCommandName({
    configuredCommand: process.env.YIRU_CLI_COMMAND,
    environment: 'production',
    platform: process.platform
  })
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    `exec "\${YIRU_AGENT_TEAMS_SHIM_BIN:-${commandName}}" agent-teams-tmux "$@"`,
    ''
  ].join('\n')
}

function windowsShimScript(): string {
  const commandName = resolveYiruCliCommandName({
    configuredCommand: process.env.YIRU_CLI_COMMAND,
    environment: 'production',
    platform: process.platform
  })
  return [
    '@echo off',
    'setlocal',
    'if "%YIRU_AGENT_TEAMS_SHIM_BIN%"=="" (',
    `  set "YIRU_AGENT_TEAMS_SHIM_BIN=${commandName}"`,
    ')',
    '"%YIRU_AGENT_TEAMS_SHIM_BIN%" agent-teams-tmux %*',
    ''
  ].join('\r\n')
}

async function writeIfChanged(path: string, content: string): Promise<void> {
  try {
    if ((await readFile(path, 'utf8')) === content) {
      return
    }
  } catch {
    // rewrite below
  }
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  let renamed = false
  try {
    await writeFile(tmp, content, 'utf8')
    if (process.platform !== 'win32') {
      await chmod(tmp, 0o755)
    }
    await rename(tmp, path)
    renamed = true
  } finally {
    if (!renamed) {
      await rm(tmp, { force: true })
    }
  }
}
