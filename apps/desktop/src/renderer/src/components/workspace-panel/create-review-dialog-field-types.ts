import type { HostedReviewCreationEligibility } from '@yiru/workbench-model/review'

import type {
  RuntimeGeneratePullRequestFieldsOverrides,
  RuntimeGitContext
} from '@/runtime/runtime-git-client'
import type { AppState } from '@/store'
import type { PullRequestFieldRevisions } from '@/store/slices/pull-request-generation'

import type { SourceControlAiPrCreationDefaults } from '../../../../shared/source-control-ai-types'
import type { Repo } from '../../../../shared/types'

export type PullRequestDraftFields = {
  base: string
  title: string
  body: string
  draft: boolean
}

export type UseCreatePullRequestDialogFieldsOptions = {
  open: boolean
  repoId: string
  worktreeId: string | null
  worktreePath: string
  branch: string
  eligibility: HostedReviewCreationEligibility | null
  currentBaseRef?: string | null
  repo?: Pick<Repo, 'sourceControlAi'> | null
  settings: AppState['settings']
  submitting: boolean
  prCreationDefaults?: SourceControlAiPrCreationDefaults
  sourceControlAiActionsVisible?: boolean
  onBranchChangedByGeneration?: () => Promise<void>
  generation?: {
    generating: boolean
    generateError: string | null
    seedRestoreKey?: string | null
    seed?: PullRequestDraftFields | null
    seedFieldRevisions?: PullRequestFieldRevisions | null
    onSeedRestored?: (seedRestoreKey: string) => void
    onGenerate: (
      fields: PullRequestDraftFields,
      fieldRevisions: PullRequestFieldRevisions,
      overrides?: RuntimeGeneratePullRequestFieldsOverrides
    ) => void
    onCancelGenerate: () => void
  }
}

export type GenerationSeed = {
  requestId: number
  fieldRevisions: PullRequestFieldRevisions
  context: RuntimeGitContext
}

export function createInitialPullRequestFieldRevisions(): PullRequestFieldRevisions {
  return { base: 0, title: 0, body: 0, draft: 0 }
}
