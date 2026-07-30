import type { ProviderRateLimits } from '../rate-limit-types'
import { defineRuntimeMethodContract } from '../runtime-method-contract'

export const CURSOR_USAGE_GET_CONTRACT = defineRuntimeMethodContract<ProviderRateLimits>()({
  name: 'usage.cursor',
  params: null,
  mobile: false
})
