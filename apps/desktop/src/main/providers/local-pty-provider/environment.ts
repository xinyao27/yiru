import { delimiter } from 'node:path'

import { resolveSafePtyDefaultCwd } from '../pty-default-cwd'

export const PANE_IDENTITY_ENV_KEYS = [
  'YIRU_PANE_KEY',
  'YIRU_TAB_ID',
  'YIRU_WORKTREE_ID',
  'YIRU_AGENT_LAUNCH_TOKEN'
] as const

export function getDefaultCwd(): string {
  return resolveSafePtyDefaultCwd()
}

/**
 * Removes inherited pane identity unless this PTY explicitly supplies it.
 */
export function removeUnspecifiedPaneIdentityEnv(
  env: Record<string, string>,
  explicitEnv: Record<string, string> | undefined
): void {
  for (const key of PANE_IDENTITY_ENV_KEYS) {
    if (!explicitEnv || !Object.hasOwn(explicitEnv, key)) {
      delete env[key]
    }
  }
}

/**
 * Promotes the agent-teams shim path ahead of inherited PATH entries.
 */
export function promoteAgentTeamsShimPath(
  env: Record<string, string>,
  requestedPath: string | undefined
): void {
  if (!env.YIRU_AGENT_TEAMS_TEAM_ID || !requestedPath) {
    return
  }
  const shimDir = requestedPath.split(delimiter)[0]
  if (!shimDir) {
    return
  }
  const currentParts = env.PATH?.split(delimiter).filter(Boolean) ?? []
  env.PATH = [shimDir, ...currentParts.filter((part) => part !== shimDir)].join(delimiter)
}
