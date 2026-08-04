import type { TuiAgent } from '@yiru/workbench-model/agent'
import type {
  PersistedTrustedYiruHookEntry,
  PersistedTrustedYiruHookRepo,
  PersistedTrustedYiruHooks
} from '@yiru/workbench-model/workspace'

import { normalizeSetupHookTrust, type SetupHookTrust } from './setup-hook-trust'
import { isMobileTuiAgent } from './tui-agents'

// Readers for the workspace-create RPC results. The transport hands back
// `unknown`, so every payload is narrowed field by field here instead of being
// asserted at the call site — a renamed or missing runtime field then degrades to
// a default rather than crashing the create form on a property of undefined.

export type WorkspaceRepo = {
  id: string
  displayName: string
  path: string
  badgeColor?: string
  connectionId?: string | null
  kind?: 'git' | 'folder'
  upstream?: { owner: string; repo: string } | null
  gitRemoteIdentity?: { remoteUrl?: string; canonicalKey?: string } | null
}

export type WorkspaceRuntimeSettings = {
  defaultTuiAgent?: TuiAgent | 'blank' | null
  disabledTuiAgents?: TuiAgent[]
  agentCmdOverrides?: Record<string, string>
}

export type WorkspaceSetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'

export type RepoHooksPayload = {
  setupCommand: string | null
  source: string | null
  setupRunPolicy: WorkspaceSetupRunPolicy
  setupTrust: SetupHookTrust | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }
  const record: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    const text = readString(entry)
    if (text !== undefined) {
      record[key] = text
    }
  }
  return record
}

function readRepo(value: unknown): WorkspaceRepo | null {
  if (!isRecord(value)) {
    return null
  }
  const id = readString(value.id)
  const displayName = readString(value.displayName)
  const path = readString(value.path)
  if (id === undefined || displayName === undefined || path === undefined) {
    return null
  }
  const upstream = isRecord(value.upstream) ? value.upstream : null
  const owner = upstream ? readString(upstream.owner) : undefined
  const repoName = upstream ? readString(upstream.repo) : undefined
  const identity = isRecord(value.gitRemoteIdentity) ? value.gitRemoteIdentity : null
  return {
    id,
    displayName,
    path,
    badgeColor: readString(value.badgeColor),
    connectionId: readString(value.connectionId) ?? null,
    kind: value.kind === 'git' || value.kind === 'folder' ? value.kind : undefined,
    upstream: owner !== undefined && repoName !== undefined ? { owner, repo: repoName } : null,
    gitRemoteIdentity: identity
      ? {
          remoteUrl: readString(identity.remoteUrl),
          canonicalKey: readString(identity.canonicalKey)
        }
      : null
  }
}

export function readWorkspaceRepos(value: unknown): WorkspaceRepo[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry): WorkspaceRepo[] => {
    const repo = readRepo(entry)
    return repo ? [repo] : []
  })
}

export function readWorkspaceRepoList(result: unknown): WorkspaceRepo[] {
  return isRecord(result) ? readWorkspaceRepos(result.repos) : []
}

export function readWorkspaceRuntimeSettings(result: unknown): WorkspaceRuntimeSettings {
  const settings = isRecord(result) && isRecord(result.settings) ? result.settings : null
  if (!settings) {
    return {}
  }
  const defaultTuiAgent = settings.defaultTuiAgent
  return {
    defaultTuiAgent:
      defaultTuiAgent === 'blank' || isMobileTuiAgent(defaultTuiAgent) ? defaultTuiAgent : null,
    disabledTuiAgents: Array.isArray(settings.disabledTuiAgents)
      ? settings.disabledTuiAgents.filter(isMobileTuiAgent)
      : [],
    agentCmdOverrides: readStringRecord(settings.agentCmdOverrides)
  }
}

function readTrustEntry(value: unknown): PersistedTrustedYiruHookEntry | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const contentHash = readString(value.contentHash)
  const approvedAt = readNumber(value.approvedAt)
  return contentHash !== undefined && approvedAt !== undefined
    ? { contentHash, approvedAt }
    : undefined
}

function readTrustRepo(value: unknown): PersistedTrustedYiruHookRepo | null {
  if (!isRecord(value)) {
    return null
  }
  const allApprovedAt = isRecord(value.all) ? readNumber(value.all.approvedAt) : undefined
  const setup = readTrustEntry(value.setup)
  const archive = readTrustEntry(value.archive)
  // Why: mobile writes this whole record back through ui.set, so the archive
  // approval must survive the round trip even though only setup is read here.
  return {
    ...(allApprovedAt !== undefined ? { all: { approvedAt: allApprovedAt } } : {}),
    ...(setup ? { setup } : {}),
    ...(archive ? { archive } : {})
  }
}

export function readTrustedYiruHooks(result: unknown): PersistedTrustedYiruHooks {
  const ui = isRecord(result) && isRecord(result.ui) ? result.ui : null
  const hooks = ui && isRecord(ui.trustedYiruHooks) ? ui.trustedYiruHooks : null
  if (!hooks) {
    return {}
  }
  const trusted: PersistedTrustedYiruHooks = {}
  for (const [repoId, entry] of Object.entries(hooks)) {
    const repo = readTrustRepo(entry)
    if (repo) {
      trusted[repoId] = repo
    }
  }
  return trusted
}

export function readGlabInstalled(result: unknown): boolean {
  if (!isRecord(result) || !isRecord(result.glab)) {
    return false
  }
  return result.glab.installed === true
}

export function readDetectedAgentIds(result: unknown): string[] {
  if (!Array.isArray(result)) {
    return []
  }
  return result.flatMap((entry): string[] => {
    const id = readString(entry)
    return id === undefined ? [] : [id]
  })
}

export function readRepoHooks(result: unknown): RepoHooksPayload {
  const payload = isRecord(result) ? result : null
  const hooks = payload && isRecord(payload.hooks) ? payload.hooks : null
  const scripts = hooks && isRecord(hooks.scripts) ? hooks.scripts : null
  const policy = payload?.setupRunPolicy
  const trust = payload && isRecord(payload.setupTrust) ? payload.setupTrust : null
  const contentHash = trust ? readString(trust.contentHash) : undefined
  const scriptContent = trust ? readString(trust.scriptContent) : undefined
  return {
    setupCommand: (scripts ? readString(scripts.setup)?.trim() : undefined) || null,
    source: (payload ? readString(payload.source) : undefined) ?? null,
    setupRunPolicy:
      policy === 'ask' || policy === 'run-by-default' || policy === 'skip-by-default'
        ? policy
        : 'run-by-default',
    setupTrust:
      contentHash !== undefined && scriptContent !== undefined
        ? normalizeSetupHookTrust({ contentHash, scriptContent })
        : null
  }
}
