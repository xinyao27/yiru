import { defineRuntimeMethodContract } from '../runtime-method-contract'
import type { RuntimeStatus } from '../runtime-types'

export const STATUS_GET_CONTRACT = defineRuntimeMethodContract<RuntimeStatus>()({
  name: 'status.get',
  params: null,
  mobile: true
})
