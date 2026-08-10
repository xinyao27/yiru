import { z } from 'zod'

const EmulatorTargetShape = {
  device: z.string().optional(),
  emulator: z.string().optional(),
  worktree: z.string().optional()
}

function isAbsoluteRuntimePath(value: string): boolean {
  // Why: this schema runs in browsers and RN while the executing host may use
  // either path convention, so accept exactly the POSIX and Win32 absolute forms.
  return value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)
}

export const EmulatorWorktreeInputSchema = z.object({ worktree: z.string().optional() }).partial()

export const EmulatorTargetInputSchema = z.object(EmulatorTargetShape)

export const EmulatorTapInputSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  ...EmulatorTargetShape
})

export const EmulatorGesturePointSchema = z.object({
  edge: z.number().int().min(0).max(4).optional(),
  type: z.enum(['begin', 'move', 'end']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
})

export const EmulatorGestureInputSchema = z.object({
  points: z.array(EmulatorGesturePointSchema).min(2).max(64),
  ...EmulatorTargetShape
})

export const EmulatorTypeInputSchema = z.object({
  text: z.string(),
  ...EmulatorTargetShape
})

export const EmulatorButtonInputSchema = z.object({
  name: z.string(),
  ...EmulatorTargetShape
})

export const EmulatorRotateOrientationSchema = z.enum([
  'portrait',
  'portrait_upside_down',
  'landscape_left',
  'landscape_right'
])

export const EmulatorRotateInputSchema = z.object({
  orientation: EmulatorRotateOrientationSchema,
  ...EmulatorTargetShape
})

export const EmulatorExecInputSchema = z.object({
  command: z.string(),
  ...EmulatorTargetShape
})

export const EmulatorInstallInputSchema = z.object({
  path: z.string().refine(isAbsoluteRuntimePath, { message: 'path must be absolute' }),
  reinstall: z.boolean().optional(),
  ...EmulatorTargetShape
})

export const EmulatorLaunchInputSchema = z.object({
  package: z.string(),
  activity: z.string().optional(),
  ...EmulatorTargetShape
})

export const EmulatorPermissionsInputSchema = z
  .object({
    op: z.enum(['grant', 'revoke', 'reset']),
    package: z.string().optional(),
    permission: z.string().optional(),
    ...EmulatorTargetShape
  })
  .superRefine((value, context) => {
    if (value.op === 'reset') {
      if (value.package) {
        context.addIssue({
          code: 'custom',
          path: ['package'],
          message: 'package is not allowed for reset'
        })
      }
      if (value.permission) {
        context.addIssue({
          code: 'custom',
          path: ['permission'],
          message: 'permission is not allowed for reset'
        })
      }
      return
    }
    if (!value.package) {
      context.addIssue({
        code: 'custom',
        path: ['package'],
        message: 'package is required for grant/revoke'
      })
    }
    if (!value.permission) {
      context.addIssue({
        code: 'custom',
        path: ['permission'],
        message: 'permission is required for grant/revoke'
      })
    }
  })

export const EmulatorLogcatInputSchema = z.object({
  lines: z.number().int().positive().optional(),
  filters: z.array(z.string()).optional(),
  ...EmulatorTargetShape
})

export const EmulatorAttachInputSchema = z.object({
  device: z.string().optional(),
  worktree: z.string().optional(),
  focus: z.boolean().optional()
})

export const EmulatorKillInputSchema = EmulatorTargetInputSchema

export const EmulatorShutdownInputSchema = EmulatorKillInputSchema.extend({
  managedOnly: z.boolean().optional()
})

export type EmulatorWorktreeInput = z.output<typeof EmulatorWorktreeInputSchema>
export type EmulatorTargetInput = z.output<typeof EmulatorTargetInputSchema>
export type EmulatorTapInput = z.output<typeof EmulatorTapInputSchema>
export type EmulatorGesturePoint = z.output<typeof EmulatorGesturePointSchema>
export type EmulatorGestureInput = z.output<typeof EmulatorGestureInputSchema>
export type EmulatorTypeInput = z.output<typeof EmulatorTypeInputSchema>
export type EmulatorButtonInput = z.output<typeof EmulatorButtonInputSchema>
export type EmulatorRotateOrientation = z.output<typeof EmulatorRotateOrientationSchema>
export type EmulatorRotateInput = z.output<typeof EmulatorRotateInputSchema>
export type EmulatorExecInput = z.output<typeof EmulatorExecInputSchema>
export type EmulatorInstallInput = z.output<typeof EmulatorInstallInputSchema>
export type EmulatorLaunchInput = z.output<typeof EmulatorLaunchInputSchema>
export type EmulatorPermissionsInput = z.output<typeof EmulatorPermissionsInputSchema>
export type EmulatorLogcatInput = z.output<typeof EmulatorLogcatInputSchema>
export type EmulatorAttachInput = z.output<typeof EmulatorAttachInputSchema>
export type EmulatorKillInput = z.output<typeof EmulatorKillInputSchema>
export type EmulatorShutdownInput = z.output<typeof EmulatorShutdownInputSchema>
