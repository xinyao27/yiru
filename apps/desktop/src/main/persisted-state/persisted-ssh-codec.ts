import {
  LEGACY_DEFAULT_SSH_RELAY_GRACE_PERIOD_SECONDS,
  type SshRemotePtyLease,
  type SshTarget
} from '@yiru/runtime-protocol/ssh-connection'

import type { PersistedState } from '../../shared/types'

type LegacySshTarget = SshTarget & {
  remoteWorkspaceSyncEnabled?: unknown
  remoteWorkspaceSyncGracePeriodSeconds?: unknown
}

export function normalizePersistedSshTarget(value: SshTarget): SshTarget {
  const target = { ...(value as LegacySshTarget) }
  const legacySyncEnabled = target.remoteWorkspaceSyncEnabled
  const currentGracePeriodSeconds = target.relayGracePeriodSeconds
  const legacyGracePeriodSeconds = target.remoteWorkspaceSyncGracePeriodSeconds
  const systemSshConnectionReuse = target.systemSshConnectionReuse
  delete target.remoteWorkspaceSyncEnabled
  delete target.remoteWorkspaceSyncGracePeriodSeconds
  delete target.relayGracePeriodSeconds
  delete target.systemSshConnectionReuse
  const relayGracePeriodSeconds =
    legacySyncEnabled === true && typeof legacyGracePeriodSeconds === 'number'
      ? legacyGracePeriodSeconds
      : currentGracePeriodSeconds
  const normalized: SshTarget = {
    ...target,
    // Why: pre-configHost targets used their label as the ssh-config alias.
    configHost: target.configHost ?? target.label ?? target.host
  }
  if (
    relayGracePeriodSeconds !== undefined &&
    relayGracePeriodSeconds !== LEGACY_DEFAULT_SSH_RELAY_GRACE_PERIOD_SECONDS
  ) {
    normalized.relayGracePeriodSeconds = relayGracePeriodSeconds
  }
  if (systemSshConnectionReuse === false) {
    normalized.systemSshConnectionReuse = false
  }
  return normalized
}

function decodeSshRemotePtyLease(value: unknown, now: () => number): SshRemotePtyLease | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Partial<SshRemotePtyLease>
  if (typeof raw.targetId !== 'string' || typeof raw.ptyId !== 'string') {
    return null
  }
  const state = raw.state ?? 'detached'
  if (!['attached', 'detached', 'terminated', 'expired'].includes(state)) {
    return null
  }
  const timestamp = now()
  return {
    targetId: raw.targetId,
    ptyId: raw.ptyId,
    ...(typeof raw.worktreeId === 'string' ? { worktreeId: raw.worktreeId } : {}),
    ...(typeof raw.worktreeInstanceId === 'string' &&
    raw.worktreeInstanceId.trim() &&
    raw.worktreeInstanceId.length <= 512
      ? { worktreeInstanceId: raw.worktreeInstanceId }
      : {}),
    ...(typeof raw.tabId === 'string' ? { tabId: raw.tabId } : {}),
    ...(typeof raw.leafId === 'string' && raw.leafId.length <= 256 ? { leafId: raw.leafId } : {}),
    state,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : timestamp,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : timestamp,
    ...(typeof raw.lastAttachedAt === 'number' ? { lastAttachedAt: raw.lastAttachedAt } : {}),
    ...(typeof raw.lastDetachedAt === 'number' ? { lastDetachedAt: raw.lastDetachedAt } : {})
  }
}

export function decodePersistedSshState(
  persisted: Partial<PersistedState> | null | undefined,
  now: () => number
): Pick<PersistedState, 'sshTargets' | 'deletedSshConfigAliases' | 'sshRemotePtyLeases'> {
  return {
    sshTargets: (persisted?.sshTargets ?? []).map(normalizePersistedSshTarget),
    deletedSshConfigAliases: Array.isArray(persisted?.deletedSshConfigAliases)
      ? persisted.deletedSshConfigAliases.filter(
          (alias): alias is string => typeof alias === 'string'
        )
      : [],
    sshRemotePtyLeases: (persisted?.sshRemotePtyLeases ?? [])
      .map((lease) => decodeSshRemotePtyLease(lease, now))
      .filter((lease): lease is SshRemotePtyLease => lease !== null)
  }
}
