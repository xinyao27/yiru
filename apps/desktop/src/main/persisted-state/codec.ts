import { getDefaultPersistedState } from '~shared/constants'
import { normalizeFeatureInteractionTelemetryBuckets } from '~shared/feature-interactions'
import { normalizeFolderWorkspaces } from '~shared/folder-workspaces'
import { normalizeProjectGroups } from '~shared/project-groups'
import type { PersistedState } from '~shared/types'

import { decodePersistedOnboarding } from './persisted-onboarding-codec'
import { decodePersistedSettings } from './persisted-settings-codec'
import { decodePersistedTelemetry } from './persisted-telemetry-codec'
import { decodePersistedTerminalSessionState } from './persisted-terminal-session-codec'
import { decodePersistedUi } from './persisted-ui-codec'
import { decodePersistedWorkspaceLineage } from './persisted-workspace-lineage-codec'
import {
  decodePersistedWorkspaceSessions,
  type PersistedStateCodecWarning
} from './persisted-workspace-session-codec'

export type PersistedStateCodecContext = {
  homeDir: string
  platform: NodeJS.Platform
  fileExistedOnLoad: boolean
  createInstallId: () => string
  now?: () => number
}

export type PersistedStateDecodeResult = {
  state: PersistedState
  needsSave: boolean
  warnings: PersistedStateCodecWarning[]
}

export function decodePersistedState(
  value: unknown,
  context: PersistedStateCodecContext
): PersistedStateDecodeResult {
  return decodePersistedStateV1(value, context)
}

// Why: keep the version boundary explicit even while schema v1 is the only
// codec. Future formats can add a decoder without entangling disk mechanics.
function decodePersistedStateV1(
  value: unknown,
  context: PersistedStateCodecContext
): PersistedStateDecodeResult {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new TypeError('Persisted state root must be an object')
  }
  const defaults = getDefaultPersistedState(context.homeDir)
  const persisted = value as Partial<PersistedState> | null | undefined
  const now = context.now ?? Date.now
  const onboarding = persisted
    ? decodePersistedOnboarding(persisted.onboarding, now)
    : { onboarding: defaults.onboarding, needsSave: false }
  const rawSettings = persisted?.settings
  const settings = decodePersistedSettings(rawSettings, context)
  const ui = decodePersistedUi(persisted?.ui, persisted?.settings, {
    onboarding: onboarding.onboarding,
    repoCount: persisted?.repos?.length ?? 0,
    legacyInlineAgentsExperimentEnabled:
      (rawSettings as { experimentalAgentDashboard?: boolean } | undefined)
        ?.experimentalAgentDashboard === true
  })
  const workspaceSessions = decodePersistedWorkspaceSessions(
    persisted?.workspaceSession,
    persisted?.workspaceSessionsByHostId,
    defaults.workspaceSession
  )
  settings.settings.telemetry = decodePersistedTelemetry(
    settings.settings.telemetry,
    context.fileExistedOnLoad,
    context.createInstallId
  )
  const projectGroups = normalizeProjectGroups(persisted?.projectGroups)
  const terminalSessions = decodePersistedTerminalSessionState(persisted)
  return {
    state: {
      ...defaults,
      ...persisted,
      ...terminalSessions,
      featureInteractionTelemetryBuckets: normalizeFeatureInteractionTelemetryBuckets(
        persisted?.featureInteractionTelemetryBuckets
      ),
      projectGroups,
      folderWorkspaces: normalizeFolderWorkspaces(persisted?.folderWorkspaces, projectGroups),
      worktreeLineageById: persisted?.worktreeLineageById ?? {},
      workspaceLineageByChildKey: decodePersistedWorkspaceLineage(
        persisted?.workspaceLineageByChildKey,
        now
      ),
      settings: settings.settings,
      ui: ui.ui,
      onboarding: onboarding.onboarding,
      workspaceSession: workspaceSessions.workspaceSession,
      workspaceSessionsByHostId: workspaceSessions.workspaceSessionsByHostId
    },
    needsSave: settings.needsSave || ui.needsSave || onboarding.needsSave,
    warnings: workspaceSessions.warnings
  }
}
