import type { GitStatusResult } from '@yiru/workbench-model/review'

import { defineRuntimeMethodContract } from '../runtime-method-contract'
import { GitStatusParams } from './git-method-params'

export const GIT_STATUS_CONTRACT = defineRuntimeMethodContract<GitStatusResult>()({
  name: 'git.status',
  params: GitStatusParams,
  mobile: true
})
