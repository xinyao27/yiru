import { z } from 'zod'

const TASK_STATUSES = ['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked'] as const

function requiredString(message: string) {
  return z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, message))
}

const OptionalFiniteNumber = z
  .unknown()
  .transform((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
  .pipe(z.union([z.number(), z.undefined()]))
  .optional()

const OptionalString = z
  .unknown()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined))
  .pipe(z.union([z.string(), z.undefined()]))
  .optional()

const OptionalBoolean = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : undefined))
  .pipe(z.union([z.boolean(), z.undefined()]))
  .optional()

export const OrchestrationRunCreateInputSchema = z.object({
  objective: requiredString('Missing --objective'),
  from: requiredString('Missing coordinator terminal')
})

export const OrchestrationRunUseInputSchema = z.object({
  id: requiredString('Missing --id'),
  from: requiredString('Missing coordinator terminal')
})

export const OrchestrationRunCurrentInputSchema = z.object({
  from: requiredString('Missing coordinator terminal')
})

export const OrchestrationEmptyInputSchema = z.object({})

export const OrchestrationRunShowInputSchema = z.object({
  id: requiredString('Missing --id'),
  from: OptionalString
})

export const OrchestrationTaskCreateInputSchema = z.object({
  spec: requiredString('Missing --spec'),
  taskTitle: OptionalString,
  displayName: OptionalString,
  deps: OptionalString,
  parent: OptionalString,
  callerTerminalHandle: OptionalString,
  run: OptionalString
})

export const OrchestrationTaskListInputSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  ready: OptionalBoolean,
  brief: OptionalBoolean,
  run: OptionalString,
  callerTerminalHandle: OptionalString
})

export const OrchestrationTaskUpdateInputSchema = z.object({
  id: requiredString('Missing --id'),
  status: z
    .unknown()
    .transform((value) =>
      typeof value === 'string' && TASK_STATUSES.includes(value as (typeof TASK_STATUSES)[number])
        ? value
        : ''
    )
    .pipe(z.enum(TASK_STATUSES, { message: 'Missing --status' })),
  result: OptionalString,
  run: OptionalString,
  callerTerminalHandle: OptionalString
})

export const OrchestrationDispatchInputSchema = z.object({
  task: requiredString('Missing --task'),
  to: OptionalString,
  from: OptionalString,
  inject: OptionalBoolean,
  dryRun: OptionalBoolean,
  returnPreamble: OptionalBoolean,
  devMode: OptionalBoolean,
  run: OptionalString
})

export const OrchestrationDispatchShowInputSchema = z.object({
  task: OptionalString,
  preamble: OptionalBoolean,
  from: OptionalString,
  devMode: OptionalBoolean
})

export const OrchestrationCoordinatorRunInputSchema = z.object({
  spec: requiredString('Missing --spec'),
  from: OptionalString,
  pollIntervalMs: OptionalFiniteNumber,
  maxConcurrent: OptionalFiniteNumber,
  worktree: OptionalString
})

export const OrchestrationGateCreateInputSchema = z.object({
  task: requiredString('Missing --task'),
  question: requiredString('Missing --question'),
  options: OptionalString
})

export const OrchestrationGateResolveInputSchema = z.object({
  id: requiredString('Missing --id'),
  resolution: requiredString('Missing --resolution')
})

export const OrchestrationGateListInputSchema = z.object({
  task: OptionalString,
  status: z.enum(['pending', 'resolved', 'timeout']).optional()
})

export const OrchestrationResetInputSchema = z
  .object({
    all: OptionalBoolean,
    tasks: OptionalBoolean,
    messages: OptionalBoolean
  })
  .superRefine((params, context) => {
    const selectedScopeCount = [params.all, params.tasks, params.messages].filter(
      (scope) => scope === true
    ).length
    if (selectedScopeCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose exactly one reset scope: --all, --tasks, or --messages.'
      })
    }
  })

export type OrchestrationRunCreateInput = z.output<typeof OrchestrationRunCreateInputSchema>
export type OrchestrationRunUseInput = z.output<typeof OrchestrationRunUseInputSchema>
export type OrchestrationRunCurrentInput = z.output<typeof OrchestrationRunCurrentInputSchema>
export type OrchestrationEmptyInput = z.output<typeof OrchestrationEmptyInputSchema>
export type OrchestrationRunShowInput = z.output<typeof OrchestrationRunShowInputSchema>
export type OrchestrationTaskCreateInput = z.output<typeof OrchestrationTaskCreateInputSchema>
export type OrchestrationTaskListInput = z.output<typeof OrchestrationTaskListInputSchema>
export type OrchestrationTaskUpdateInput = z.output<typeof OrchestrationTaskUpdateInputSchema>
export type OrchestrationDispatchInput = z.output<typeof OrchestrationDispatchInputSchema>
export type OrchestrationDispatchShowInput = z.output<typeof OrchestrationDispatchShowInputSchema>
export type OrchestrationCoordinatorRunInput = z.output<
  typeof OrchestrationCoordinatorRunInputSchema
>
export type OrchestrationGateCreateInput = z.output<typeof OrchestrationGateCreateInputSchema>
export type OrchestrationGateResolveInput = z.output<typeof OrchestrationGateResolveInputSchema>
export type OrchestrationGateListInput = z.output<typeof OrchestrationGateListInputSchema>
export type OrchestrationResetInput = z.output<typeof OrchestrationResetInputSchema>
