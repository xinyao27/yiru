import { delimiter } from 'node:path'

import {
  gitCredentialPromptGuardEnv,
  mergeGitConfigEnvProtocol
} from '~shared/git/credential-prompt-env'
import { TERMINAL_GIT_CREDENTIAL_GUARD_POLICY_ENV } from '~shared/terminal/git-credential-guard'

import { removeAppImageRuntimeEnv } from '../pty/appimage-terminal-env'
import { removeInheritedNoColor } from '../pty/terminal-color-env'
import type { PtySubprocessOptions } from './pty-subprocess-types'

const PANE_IDENTITY_ENV_KEYS = [
  'YIRU_PANE_KEY',
  'YIRU_TAB_ID',
  'YIRU_WORKTREE_ID',
  'YIRU_AGENT_LAUNCH_TOKEN'
] as const

function composeGuardedDaemonGitConfigEnv(
  env: Record<string, string>,
  options: PtySubprocessOptions
): void {
  const policy = options.env?.[TERMINAL_GIT_CREDENTIAL_GUARD_POLICY_ENV]
  delete env[TERMINAL_GIT_CREDENTIAL_GUARD_POLICY_ENV]
  if (policy !== 'guard' && options.launchAgent === undefined) {
    return
  }
  // Why: the daemon can outlive Electron, so its inherited config is the
  // authority; append only the guard after the wire-protocol environment merge.
  Object.assign(env, gitCredentialPromptGuardEnv(env, process.platform))
}

export function deleteRequestedDaemonEnvKeys(
  env: Record<string, string>,
  keys: readonly string[] | undefined
): void {
  const deleteYiruOwnedCodexHome =
    keys?.includes('YIRU_CODEX_HOME') === true &&
    env.YIRU_CODEX_HOME !== undefined &&
    env.CODEX_HOME === env.YIRU_CODEX_HOME
  for (const key of keys ?? []) {
    delete env[key]
  }
  if (deleteYiruOwnedCodexHome) {
    delete env.CODEX_HOME
  }
}

function removeUnspecifiedPaneIdentityEnv(
  env: Record<string, string>,
  explicitEnv: Record<string, string> | undefined
): void {
  for (const key of PANE_IDENTITY_ENV_KEYS) {
    if (!explicitEnv || !Object.hasOwn(explicitEnv, key)) {
      delete env[key]
    }
  }
}

function removeInheritedDevAgentHookEndpoint(
  env: Record<string, string>,
  explicitEnv: Record<string, string> | undefined
): void {
  if (explicitEnv?.YIRU_AGENT_HOOK_ENV === 'development' && !explicitEnv.YIRU_AGENT_HOOK_ENDPOINT) {
    // Why: detached daemons can retain a stale development hook endpoint.
    delete env.YIRU_AGENT_HOOK_ENDPOINT
  }
}

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

export function createDaemonPtyEnvironment(options: PtySubprocessOptions): Record<string, string> {
  const env: Record<string, string> = {
    ...mergeGitConfigEnvProtocol(process.env, options.env),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'Yiru',
    TERM_PROGRAM_VERSION: process.env.YIRU_APP_VERSION ?? '0.0.0-dev',
    // Why: Yiru's xterm.js parses OSC 8 even though third-party detection
    // libraries do not recognize TERM_PROGRAM=Yiru.
    FORCE_HYPERLINK: '1'
  }
  composeGuardedDaemonGitConfigEnv(env, options)
  deleteRequestedDaemonEnvKeys(env, options.envToDelete)
  if (options.env?.TERM) {
    env.TERM = options.env.TERM
  }
  removeUnspecifiedPaneIdentityEnv(env, options.env)
  removeInheritedDevAgentHookEndpoint(env, options.env)
  delete env.ELECTRON_RUN_AS_NODE
  removeAppImageRuntimeEnv(env)
  removeInheritedNoColor(env)
  env.LANG ??= 'en_US.UTF-8'
  return env
}
