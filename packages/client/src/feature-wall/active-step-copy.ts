import type { AgentsStep } from '@yiru/runtime-protocol/workbench/agents-orchestration-steps'
import type { ReviewStep } from '@yiru/runtime-protocol/workbench/review-steps'
import type { WorkbenchStep } from '@yiru/runtime-protocol/workbench/workbench-steps'

import type { FeatureWallActiveStepCopy } from './tour-panel'

export function getFeatureWallActiveStepCopy(
  agentsActiveStep: AgentsStep | null,
  workbenchActiveStep: WorkbenchStep | null,
  reviewActiveStep: ReviewStep | null
): FeatureWallActiveStepCopy | null {
  const activeStep = agentsActiveStep ?? workbenchActiveStep ?? reviewActiveStep
  if (!activeStep) {
    return null
  }
  return {
    title: activeStep.subtitle,
    description: activeStep.description,
    optional: 'optional' in activeStep && activeStep.optional === true
  }
}
