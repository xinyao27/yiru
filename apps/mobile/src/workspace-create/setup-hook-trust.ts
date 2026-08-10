import type { PersistedTrustedYiruHooks } from '@yiru/workbench-model/workspace'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

export type SetupHookTrust = {
  contentHash: string
  scriptContent: string
}

export function isSetupHookTrusted(
  trust: PersistedTrustedYiruHooks,
  repoId: string,
  contentHash: string
): boolean {
  const repoTrust = trust[repoId]
  return Boolean(repoTrust?.all || repoTrust?.setup?.contentHash === contentHash)
}

export function wasSetupHookPreviouslyApproved(
  trust: PersistedTrustedYiruHooks,
  repoId: string
): boolean {
  return Boolean(trust[repoId]?.setup?.contentHash)
}

export function trustedYiruHooksWithSetupApproval(args: {
  trust: PersistedTrustedYiruHooks
  repoId: string
  contentHash: string
  alwaysTrust: boolean
  approvedAt?: number
}): PersistedTrustedYiruHooks {
  const approvedAt = args.approvedAt ?? Date.now()
  const existing = args.trust[args.repoId]
  const nextRepo = args.alwaysTrust
    ? { ...existing, all: { approvedAt } }
    : { ...existing, setup: { contentHash: args.contentHash, approvedAt } }
  return { ...args.trust, [args.repoId]: nextRepo }
}

export async function persistSetupHookTrustApproval(args: {
  client: RpcClient
  trust: PersistedTrustedYiruHooks
  repoId: string
  contentHash: string
  alwaysTrust: boolean
}): Promise<PersistedTrustedYiruHooks> {
  const next = trustedYiruHooksWithSetupApproval(args)
  await callRuntimeOrpc(args.client, (runtime) => runtime.ui.set, { trustedYiruHooks: next })
  return next
}

export function normalizeSetupHookTrust(
  setupTrust: SetupHookTrust | null | undefined
): SetupHookTrust | null {
  if (!setupTrust?.contentHash || !setupTrust.scriptContent) {
    return null
  }
  return setupTrust
}
