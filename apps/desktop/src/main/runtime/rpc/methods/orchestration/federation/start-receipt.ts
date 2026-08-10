import type { OrchestrationFederationAttachStartResult } from '@yiru/runtime-protocol/contract'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'

import type { WorkerSetupReceipt } from '../worker/topology'
import { isFederationEffectUnknown } from './effects'

export function failFederatedAttachmentWithReceipt(args: {
  db: OrchestrationDb
  dispatchId: string
  runtimeEpoch: string
  failedStage: string
  error: unknown
  setup: WorkerSetupReceipt
}): OrchestrationFederationAttachStartResult {
  const reason = args.error instanceof Error ? args.error.message : String(args.error)
  const unknown = isFederationEffectUnknown(args.error, args.failedStage)
  const attachment = args.db.failRemoteAttachment(
    args.dispatchId,
    args.failedStage,
    reason,
    unknown
  )
  return {
    dispatchId: args.dispatchId,
    state: attachment.state === 'start_unknown' ? 'outcome_unknown' : attachment.state,
    stage: attachment.stage,
    runtimeEpoch: args.runtimeEpoch,
    failedStage: args.failedStage,
    lastError: reason,
    setup: args.setup,
    effects: JSON.parse(attachment.effects),
    residualResources: JSON.parse(attachment.residual_resources)
  }
}
