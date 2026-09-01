import { extname } from 'node:path'

import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'

import { getRuntimeHostSecureStorageProvider } from '../runtime/host/secure-storage-provider'

export const PERSISTENCE_REGIONS = [
  'projects',
  'worktrees',
  'settings',
  'ui',
  'sessions',
  'runtime'
] as const

export type PersistenceRegion = (typeof PERSISTENCE_REGIONS)[number]

export function getPersistenceRegionPath(dataFile: string, region: PersistenceRegion): string {
  const extension = extname(dataFile)
  const stem = extension ? dataFile.slice(0, -extension.length) : dataFile
  return `${stem}-${region}${extension || '.json'}`
}

function encrypt(plaintext: string): string {
  const secureStorage = getRuntimeHostSecureStorageProvider()
  if (!plaintext || !secureStorage?.isEncryptionAvailable()) {
    return plaintext
  }
  try {
    return secureStorage.encryptString(plaintext).toString('base64')
  } catch (error) {
    console.error('[persistence] Encryption failed:', error)
    return plaintext
  }
}

export function serializePersistenceRegion(
  state: PersistedState,
  region: PersistenceRegion
): string {
  switch (region) {
    case 'projects':
      return JSON.stringify({
        schemaVersion: state.schemaVersion,
        repos: state.repos,
        projects: state.projects,
        projectHostSetups: state.projectHostSetups,
        projectGroups: state.projectGroups,
        folderWorkspaces: state.folderWorkspaces,
        sparsePresetsByRepo: state.sparsePresetsByRepo
      })
    case 'worktrees':
      return JSON.stringify({
        worktreeMeta: state.worktreeMeta,
        worktreeLineageById: state.worktreeLineageById,
        workspaceLineageByChildKey: state.workspaceLineageByChildKey
      })
    case 'settings':
      return JSON.stringify({
        settings: {
          ...state.settings,
          opencodeSessionCookie: encrypt(state.settings.opencodeSessionCookie),
          httpProxyUrl: encrypt(state.settings.httpProxyUrl ?? '')
        }
      })
    case 'ui':
      return JSON.stringify({
        ui: {
          ...state.ui,
          browserKagiSessionLink: state.ui.browserKagiSessionLink
            ? encrypt(state.ui.browserKagiSessionLink)
            : null
        },
        onboarding: state.onboarding,
        featureInteractionTelemetryBuckets: state.featureInteractionTelemetryBuckets
      })
    case 'sessions':
      return JSON.stringify({
        workspaceSession: state.workspaceSession,
        workspaceSessionsByHostId: state.workspaceSessionsByHostId,
        claudeLivePtySessionIds: state.claudeLivePtySessionIds
      })
    case 'runtime':
      return JSON.stringify({
        migrationUnsupportedPtyEntries: state.migrationUnsupportedPtyEntries,
        legacyPaneKeyAliasEntries: state.legacyPaneKeyAliasEntries,
        rateLimitResumes: state.rateLimitResumes
      })
  }
}
