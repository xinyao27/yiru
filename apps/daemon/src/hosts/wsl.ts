import { posix } from 'node:path'

import { toWslExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

import type { Host } from './contract'
import { buildPosixCommand, buildPosixPtyCommand } from './posix-shell'
import { localEnvironment, runHostProcess } from './process'

export function createWslHost(label: string, distribution: string): Host {
  if (!distribution.trim() || distribution.startsWith('-') || /[\0\r\n]/.test(distribution)) {
    throw new Error('wsl_distribution_invalid')
  }
  const executable = Bun.which('wsl.exe') ?? 'wsl.exe'
  const runRemote = (command: string, timeoutMs?: number) =>
    runHostProcess([executable, '--distribution', distribution, '--exec', 'sh', '-lc', command], {
      timeoutMs
    })
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
    id: toWslExecutionHostId(distribution),
    join: posix.join,
    kind: 'wsl',
    label,
    platform: 'linux',
    ptyLaunch: (input) => ({
      argv: [
        executable,
        '--distribution',
        distribution,
        '--exec',
        'sh',
        '-lc',
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
    target: distribution,
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
