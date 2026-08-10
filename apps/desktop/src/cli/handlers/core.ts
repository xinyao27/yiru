import { spawn } from 'node:child_process'
import { normalize } from 'node:path'

import type { RuntimeWorkspaceOpenPathResult } from '~shared/runtime-types'

import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { formatCliStatus, formatStatus, printResult } from '../format'
import { resolveRepoPathArgument } from '../repo-path-arguments'
import { RuntimeClientError, serveYiruApp } from '../runtime-client'
import { stripElectronRunAsNode } from '../runtime/launch'

function envRecord(): Record<string, string> {
  // Why: the `yiru` launcher runs Yiru's Electron binary as Node, so this CLI
  // process carries ELECTRON_RUN_AS_NODE=1. Strip it before it reaches the
  // spawned `claude` (and any nested Electron it launches), which would
  // otherwise be forced into headless plain-Node mode.
  const env = stripElectronRunAsNode(process.env)
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
}

function withTeammateModeAuto(args: string[]): string[] {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--teammate-mode' || arg.startsWith('--teammate-mode=')) {
      return args
    }
  }
  return ['--teammate-mode', 'auto', ...args]
}

async function runClaudeAgentTeams(env: Record<string, string>, args: string[]): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn('claude', withTeammateModeAuto(args), {
      stdio: 'inherit',
      env
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code)
        return
      }
      resolve(signal ? 1 : 0)
    })
  })
}

function getOpenDirectory(flags: Map<string, string | boolean>): string | undefined {
  if (!flags.has('path')) {
    return undefined
  }
  const path = getOptionalStringFlag(flags, 'path')
  if (!path) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --path.')
  }
  return path
}

function isCurrentDirectoryShorthand(path: string): boolean {
  return normalize(path) === '.'
}

function getSshContextWorktree(path: string): string | undefined {
  if (process.env.YIRU_CLI_EXECUTION_HOST_KIND !== 'ssh' || !isCurrentDirectoryShorthand(path)) {
    return undefined
  }
  const worktreeId = process.env.YIRU_WORKTREE_ID
  if (!worktreeId) {
    throw new RuntimeClientError(
      'invalid_argument',
      '`yiru .` over SSH currently requires a Yiru-managed workspace terminal.'
    )
  }
  return worktreeId.startsWith('id:') ? worktreeId : `id:${worktreeId}`
}

function formatWorkspaceOpen(result: RuntimeWorkspaceOpenPathResult): string {
  const target = result.kind === 'folder' ? 'folder workspace' : 'workspace'
  return result.disposition === 'added'
    ? `Added and opened ${target}: ${result.resolvedPath}`
    : `Opened ${target}: ${result.resolvedPath}`
}

function getOptionalServePort(flags: Map<string, string | boolean>): string | null {
  if (!flags.has('port')) {
    return null
  }
  const rawPort = flags.get('port')
  if (typeof rawPort !== 'string' || rawPort.length === 0) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --port.')
  }
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RuntimeClientError('invalid_argument', `Invalid --port value: ${rawPort}`)
  }
  return rawPort
}

export const CORE_HANDLERS: Record<string, CommandHandler> = {
  'claude-teams': async ({ client, rawArgs }) => {
    if (process.platform === 'win32') {
      throw new RuntimeClientError(
        'unsupported_platform',
        'Claude Agent Teams native panes are not supported on Windows.'
      )
    }
    const paneKey = process.env.YIRU_PANE_KEY
    if (!paneKey) {
      throw new RuntimeClientError(
        'invalid_environment',
        'yiru claude-teams must be run inside a Yiru terminal.'
      )
    }
    const response = await client.call(client.rpc.agentTeams.prepareLaunch, {
      paneKey,
      env: envRecord()
    })
    process.exitCode = await runClaudeAgentTeams(
      {
        ...envRecord(),
        ...response.result.launch.env
      },
      rawArgs ?? []
    )
  },
  open: async ({ client, json, flags, cwd }) => {
    const directory = getOpenDirectory(flags)
    if (!directory) {
      const result = await client.openYiru()
      printResult(result, json, formatCliStatus)
      return
    }

    const contextWorktree = getSshContextWorktree(directory)
    if (process.env.YIRU_CLI_EXECUTION_HOST_KIND === 'ssh' && !contextWorktree) {
      // Why: the host CLI cannot safely interpret an arbitrary SSH path as a
      // local path; managed `yiru .` uses the validated worktree context instead.
      throw new RuntimeClientError(
        'unsupported_remote_path',
        'Opening arbitrary SSH directories is not supported yet. Run `yiru .` inside a Yiru-managed workspace.'
      )
    }

    const targetPath = contextWorktree ? cwd : resolveRepoPathArgument(directory, cwd)
    await client.openYiru()
    const result = await client.call(client.rpc.workspace.openPath, {
      path: targetPath,
      ...(contextWorktree ? { contextWorktree } : {})
    })
    printResult(result, json, formatWorkspaceOpen)
  },
  serve: async ({ flags, json }) => {
    const mobilePairing = flags.get('mobile-pairing') === true
    const pairingAddressFlag = flags.get('pairing-address')
    const pairingAddress = typeof pairingAddressFlag === 'string' ? pairingAddressFlag : null
    if (pairingAddress && !mobilePairing) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--pairing-address requires --mobile-pairing. Desktop connections use Coworking.'
      )
    }
    const port = getOptionalServePort(flags)
    const exitCode = await serveYiruApp({
      electron: flags.get('electron') === true,
      json,
      port,
      pairingAddress,
      mobilePairing
    })
    process.exitCode = exitCode
  },
  status: async ({ client, json }) => {
    const result = await client.getCliStatus()
    if (!json && !result.result.runtime.reachable) {
      process.exitCode = 1
    }
    printResult(result, json, formatStatus)
  }
}
