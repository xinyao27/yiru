import { posix as pathPosix } from 'node:path'

import {
  emptySkillLockIndex,
  mergeSkillLockMaps,
  parseSkillLockfile,
  type SkillLockIndex
} from '~main/skills/lockfile'

import { buildEncodedWslBashCommand, quoteBashString } from '../platform/wsl-bash-command'
import { captureSubprocess } from '../subprocess-capture'

const WSL_LOCKFILE_TIMEOUT_MS = 5_000
const WSL_LOCKFILE_MAX_BUFFER_BYTES = 2 * 1024 * 1024
const MAX_LOCKFILE_BYTES = 256 * 1024

function buildWslLockfileReadCommand(paths: readonly string[]): string {
  const lines = ['set -u', 'set -o pipefail']
  for (const path of paths) {
    lines.push(
      `if [ -f ${quoteBashString(path)} ]; then`,
      `  encoded=$(head -c ${MAX_LOCKFILE_BYTES} -- ${quoteBashString(path)} | base64 | tr -d '\\n') || encoded=`,
      `  printf '%s\\0%s\\0' ${quoteBashString(path)} "$encoded"`,
      'fi'
    )
  }
  return buildEncodedWslBashCommand(lines.join('\n'))
}

function parseWslLockfileOutput(output: string): SkillLockIndex {
  const fields = output.split('\0')
  const maps: Map<string, string>[] = []
  let index = 0
  while (index < fields.length && fields[index]) {
    index += 1
    const encoded = fields[index++]
    if (!encoded) {
      continue
    }
    try {
      const json: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
      maps.push(parseSkillLockfile(json))
    } catch {
      // Why: a truncated or non-JSON lockfile must not fail the skill scan.
    }
  }
  return maps.length === 0 ? emptySkillLockIndex() : mergeSkillLockMaps(maps)
}

export async function readSkillLockIndexInWsl(args: {
  distro: string
  homeDir: string
  cwd: string
}): Promise<SkillLockIndex> {
  const paths = [
    pathPosix.join(args.homeDir, '.agents', '.skill-lock.json'),
    pathPosix.join(args.cwd, 'skills-lock.json')
  ]
  const uniquePaths = [...new Set(paths)]
  const command = buildWslLockfileReadCommand(uniquePaths)
  const { stdout } = await captureSubprocess(
    'wsl.exe',
    ['-d', args.distro, '--', 'bash', '-c', command],
    {
      maxBufferBytes: WSL_LOCKFILE_MAX_BUFFER_BYTES,
      timeoutMs: WSL_LOCKFILE_TIMEOUT_MS
    }
  )
  return parseWslLockfileOutput(stdout.toString())
}
