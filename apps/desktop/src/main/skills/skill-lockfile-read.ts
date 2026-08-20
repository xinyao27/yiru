import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import {
  emptySkillLockIndex,
  mergeSkillLockMaps,
  parseSkillLockfile,
  type SkillLockIndex
} from '~shared/skill-lockfile'
import type { Repo } from '~shared/types'

const MAX_LOCKFILE_BYTES = 256 * 1024

export function globalSkillLockfilePath(homeDir: string): string {
  return join(homeDir, '.agents', '.skill-lock.json')
}

export function projectSkillLockfilePath(repoPath: string): string {
  return join(repoPath, 'skills-lock.json')
}

function projectLockfilePaths(args: {
  cwd?: string
  repos?: readonly Repo[]
  includeCwd?: boolean
}): string[] {
  const projectPaths = new Set<string>()
  for (const repo of args.repos ?? []) {
    if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    projectPaths.add(repo.path)
  }
  if (args.includeCwd !== false && args.cwd) {
    projectPaths.add(args.cwd)
  }
  return [...projectPaths].map((repoPath) => projectSkillLockfilePath(repoPath))
}

async function readSkillLockMap(path: string): Promise<Map<string, string>> {
  try {
    const handle = await readFile(path)
    if (handle.byteLength > MAX_LOCKFILE_BYTES) {
      return new Map()
    }
    return parseSkillLockfile(JSON.parse(handle.toString('utf8')) as unknown)
  } catch {
    return new Map()
  }
}

/** Loads every lockfile this host's scan can see: the global CLI ledger and
 *  each local checkout's project lock. Missing files are empty maps. */
export async function readSkillLockIndex(args: {
  homeDir?: string
  cwd?: string
  repos?: readonly Repo[]
  includeCwd?: boolean
}): Promise<SkillLockIndex> {
  const homeDir = args.homeDir ?? homedir()
  const paths = [globalSkillLockfilePath(homeDir), ...projectLockfilePaths(args)]
  const maps = await Promise.all(paths.map((path) => readSkillLockMap(path)))
  return maps.every((map) => map.size === 0) ? emptySkillLockIndex() : mergeSkillLockMaps(maps)
}
