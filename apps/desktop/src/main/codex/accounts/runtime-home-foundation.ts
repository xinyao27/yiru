import { parseWslUncPath } from '@yiru/workbench-model/platform'
import type { CodexManagedAccount } from '~shared/types'

import { prepareSystemConfigForFreshRuntimeMirror } from '../config-mirror'

export type CodexAuthIdentity = {
  email: string | null
  providerAccountId: string | null
  workspaceAccountId: string | null
}

export type CodexSystemDefaultSnapshot = {
  authJson: string | null
}

export type CodexRuntimeLogoutMarker = {
  systemDefaultAuthJson: string | null
  loggedOutAt: number
}

export type CodexRuntimeLogoutMarkerStatus =
  | { kind: 'missing' }
  | { kind: 'applies' }
  | { kind: 'system-default-changed'; systemDefaultAuthJson: string | null }

export type CodexReadBackResult = 'unchanged' | 'persisted' | 'rejected'
export type CodexReadBackMatch =
  | {
      kind: 'matched'
      account: CodexManagedAccount
      managedAuthPath: string
      managedAuthContents: string
    }
  | { kind: 'none' | 'ambiguous' }

export function readLaunchEnvValue(
  launchEnv: NodeJS.ProcessEnv,
  key: 'CODEX_HOME' | 'YIRU_CODEX_HOME' | 'HOME' | 'SHELL'
): string | undefined {
  return Object.prototype.hasOwnProperty.call(launchEnv, key) ? launchEnv[key] : process.env[key]
}

export function getEffectiveCodexHomeEnv(launchEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    CODEX_HOME: readLaunchEnvValue(launchEnv, 'CODEX_HOME'),
    YIRU_CODEX_HOME: readLaunchEnvValue(launchEnv, 'YIRU_CODEX_HOME')
  }
}

// Why: the seed config is read over UNC but consumed by Codex inside WSL, so
// relative path-valued settings must anchor to the Linux-side source home; a
// verbatim copy breaks Codex config load (os error 2).
export function prepareWslRuntimeSeedConfig(
  configContents: string,
  sourceHomePath: string
): string {
  return prepareSystemConfigForFreshRuntimeMirror(
    configContents,
    parseWslUncPath(sourceHomePath)?.linuxPath ?? sourceHomePath
  )
}
