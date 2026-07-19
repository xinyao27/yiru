import type { HostedReviewExecutionOptions } from './hosted-review-git-options'

export type HostedReviewLookupOptions = HostedReviewExecutionOptions & {
  /** Preserve provider failures instead of treating them as a definitive missing review. */
  throwOnProviderError?: boolean
}
