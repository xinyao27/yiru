import { posix } from 'node:path'

import { toSshExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import type { Host } from './contract'
import { buildPosixCommand, buildPosixPtyCommand } from './posix-shell'
import { localEnvironment, runHostProcess } from './process'

const SSH_TARGET_PATTERN = /^[A-Za-z0-9._@%+:[\]-]+$/

export function createSshHost(label: string, target: string): Host {
  if (!SSH_TARGET_PATTERN.test(target) || target.startsWith('-')) {
    throw new Error('ssh_target_invalid')
  }
  const executable = Bun.which('ssh') ?? 'ssh'
  const baseArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '--', target]
  const runRemote = (command: string, timeoutMs?: number) =>
    runHostProcess([executable, ...baseArgs, command], { timeoutMs })
  return {
    basename: posix.basename,
    canonicalDirectory: async (path) => {
      const result = await runRemote(buildPosixCommand({ args: ['-P'], command: 'pwd', cwd: path }))
      if (result.exitCode !== 0) {
        throw new Error('host_path_not_directory')
      }
      return result.stdout.trim()
    },
    dirname: posix.dirname,
    exec: (input) =>
      runRemote(
        buildPosixCommand({
          args: input.args,
          command: input.command,
          cwd: input.cwd,
          env: input.env
        }),
        input.timeoutMs
      ),
    fileExists: async (path) =>
      (await runRemote(buildPosixCommand({ args: ['-e', path], command: 'test' }))).exitCode === 0,
    homeDirectory: async () => {
      const result = await runRemote('printf %s "$HOME"')
      return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null
    },
    id: toSshExecutionHostId(target),
    join: posix.join,
    kind: 'ssh',
    label,
    platform: 'unknown',
    ptyLaunch: (input) => ({
      argv: [
        executable,
        '-tt',
        '-o',
        'ConnectTimeout=10',
        '--',
        target,
        buildPosixPtyCommand(input)
      ],
      env: localEnvironment()
    }),
    readText: async (path, maxBytes) => {
      const content = await runRemote(
        buildPosixCommand({ args: ['-c', String(maxBytes + 1), '--', path], command: 'head' })
      )
      return content.exitCode === 0 &&
        new TextEncoder().encode(content.stdout).byteLength <= maxBytes
        ? content.stdout
        : null
    },
    target,
    which: async (command) => {
      const result = await runRemote(
        buildPosixCommand({
          args: ['-lc', 'command -v -- "$1"', 'sh', command],
          command: 'sh'
        })
      )
      return result.exitCode === 0 ? (result.stdout.trim().split(/\r?\n/, 1)[0] ?? null) : null
    }
  }
}
