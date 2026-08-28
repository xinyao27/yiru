import type { FeatureInteractionState } from '@yiru/runtime-protocol/workbench/feature-interactions'
import {
  FEATURE_TIPS,
  getCompletedFeatureTipIds,
  getOrderedUnseenFeatureTips,
  isFeatureTipId,
  type FeatureTip,
  type FeatureTipId
} from '@yiru/runtime-protocol/workbench/feature-tips'

export function getFeatureTipForModal(args: {
  cliInstalled: boolean
  modalData: Record<string, unknown>
  seenTipIds: readonly FeatureTipId[]
  featureInteractions: FeatureInteractionState
}): FeatureTip | null {
  const modalTipId = isFeatureTipId(args.modalData.tipId) ? args.modalData.tipId : null
  if (modalTipId) {
    return FEATURE_TIPS.find((tip) => tip.id === modalTipId) ?? null
  }

  const pendingTips = getOrderedUnseenFeatureTips({
    seenTipIds: new Set(args.seenTipIds),
    completedTipIds: getCompletedFeatureTipIds({
      cliInstalled: args.cliInstalled,
      featureInteractions: args.featureInteractions
    })
  })

  return pendingTips[0] ?? null
}
