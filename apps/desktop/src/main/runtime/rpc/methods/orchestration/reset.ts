import { z } from 'zod'

import { OptionalBoolean } from '../../../../../shared/runtime-method-contracts/runtime-method-params'
import { defineMethod, type RpcMethod } from '../../core'

const ResetParams = z
  .object({
    all: OptionalBoolean,
    tasks: OptionalBoolean,
    messages: OptionalBoolean
  })
  .superRefine((params, ctx) => {
    const selectedScopeCount = [params.all, params.tasks, params.messages].filter(
      (scope) => scope === true
    ).length
    if (selectedScopeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose exactly one reset scope: --all, --tasks, or --messages.'
      })
    }
  })

export const ORCHESTRATION_RESET_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.reset',
    params: ResetParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      if (params.all) {
        db.resetAll()
        return { reset: 'all' }
      }
      if (params.tasks) {
        db.resetTasks()
        return { reset: 'tasks' }
      }
      if (params.messages) {
        db.resetMessages()
        return { reset: 'messages' }
      }
      throw new Error('Invalid reset scope')
    }
  })
]
