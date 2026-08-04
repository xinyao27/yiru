import { z } from 'zod'
import { defineMethod, type RpcMethod } from '~main/runtime/rpc/core'
import { OptionalBoolean } from '~shared/runtime-method-contracts/runtime-method-params'

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
    // Why: `--all` calls db.resetAll(), truncating every run, task, message and
    // gate across all projects on the host — not just the caller's run.
    access: { scope: 'host', tier: 'host' },
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
