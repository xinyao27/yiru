import { z } from 'zod'

import {
  OptionalBoolean,
  OptionalFiniteNumber,
  OptionalString,
  requiredString
} from './input-schema.js'

const HOTKEY_MODIFIERS = new Set([
  'alt',
  'cmd',
  'cmdorctrl',
  'command',
  'commandorcontrol',
  'control',
  'ctrl',
  'meta',
  'option',
  'shift',
  'super',
  'win'
])

const HOTKEY_HINT =
  'Hotkey requires a modifier and one key, e.g. CmdOrCtrl+A. Use press-key for a single key.'
const PRESS_KEY_HINT =
  'Press-key accepts one key only, e.g. Return, Escape, Tab, or +. Use hotkey for modifier combinations.'

const OptionalNonNegativeInt = z.number().int().nonnegative().optional()
const OptionalPositiveInt = z.number().int().positive().optional()

const ComputerTargetSchema = z.object({
  app: requiredString('Missing app'),
  session: OptionalString,
  worktree: OptionalString
})

const ComputerObserveTargetBaseSchema = ComputerTargetSchema.extend({
  noScreenshot: OptionalBoolean,
  restoreWindow: OptionalBoolean,
  windowId: OptionalNonNegativeInt,
  windowIndex: OptionalNonNegativeInt
})

function normalizeHotkeyPart(part: string): string {
  return part.toLowerCase().replace(/[\s_-]/g, '')
}

function computerUseHotkeyValidationMessage(key: string): string | null {
  const parts = key.split('+').map((part) => part.trim())
  if (parts.length < 2 || parts.some((part) => part.length === 0)) {
    return HOTKEY_HINT
  }
  const keyPartCount = parts.filter(
    (part) => !HOTKEY_MODIFIERS.has(normalizeHotkeyPart(part))
  ).length
  return keyPartCount === 1 ? null : HOTKEY_HINT
}

function computerUsePressKeyValidationMessage(key: string): string | null {
  const trimmed = key.trim()
  return trimmed.length === 0 || (trimmed !== '+' && trimmed.includes('+')) ? PRESS_KEY_HINT : null
}

function validateWindowTarget(
  value: { windowId?: number; windowIndex?: number },
  context: z.RefinementCtx
): void {
  if (value.windowId !== undefined && value.windowIndex !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Window targeting accepts either --window-id or --window-index, not both'
    })
  }
}

function validateComputerTarget(
  value: { session?: string; worktree?: string; windowId?: number; windowIndex?: number },
  context: z.RefinementCtx
): void {
  if (value.session !== undefined && value.worktree !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Computer-use targeting accepts either session or worktree, not both'
    })
  }
  validateWindowTarget(value, context)
}

export const ComputerEmptyInputSchema = z.object({})

export const ComputerObserveTargetInputSchema =
  ComputerObserveTargetBaseSchema.superRefine(validateComputerTarget)

export const ComputerListAppsInputSchema = z.object({}).strict()

export const ComputerListWindowsInputSchema = z
  .object({ app: requiredString('Missing app') })
  .strict()

export const ComputerClickInputSchema = ComputerObserveTargetBaseSchema.extend({
  elementIndex: OptionalNonNegativeInt,
  x: OptionalFiniteNumber,
  y: OptionalFiniteNumber,
  clickCount: OptionalPositiveInt,
  mouseButton: z.enum(['left', 'right', 'middle']).optional()
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  const hasElement = value.elementIndex !== undefined
  const hasX = value.x !== undefined
  const hasY = value.y !== undefined
  if (!hasElement && !(hasX && hasY)) {
    context.addIssue({
      code: 'custom',
      message: 'Click requires --element-index or both --x and --y'
    })
  }
  if (hasX !== hasY) {
    context.addIssue({ code: 'custom', message: 'Click coordinates require both --x and --y' })
  }
  if (hasElement && (hasX || hasY)) {
    context.addIssue({
      code: 'custom',
      message: 'Click accepts either --element-index or coordinate flags, not both'
    })
  }
})

export const ComputerSecondaryActionInputSchema = ComputerObserveTargetBaseSchema.extend({
  elementIndex: OptionalNonNegativeInt,
  action: requiredString('Missing action')
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  if (value.elementIndex === undefined) {
    context.addIssue({ code: 'custom', message: 'Missing element index' })
  }
})

export const ComputerScrollInputSchema = ComputerObserveTargetBaseSchema.extend({
  elementIndex: OptionalNonNegativeInt,
  x: OptionalFiniteNumber,
  y: OptionalFiniteNumber,
  direction: z.enum(['up', 'down', 'left', 'right']),
  pages: z.number().positive().optional()
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  const hasElement = value.elementIndex !== undefined
  const hasX = value.x !== undefined
  const hasY = value.y !== undefined
  if (!hasElement && !(hasX && hasY)) {
    context.addIssue({
      code: 'custom',
      message: 'Scroll requires --element-index or both --x and --y'
    })
  }
  if (hasX !== hasY) {
    context.addIssue({ code: 'custom', message: 'Scroll coordinates require both --x and --y' })
  }
  if (hasElement && (hasX || hasY)) {
    context.addIssue({
      code: 'custom',
      message: 'Scroll accepts either --element-index or coordinate flags, not both'
    })
  }
})

export const ComputerDragInputSchema = ComputerObserveTargetBaseSchema.extend({
  fromElementIndex: OptionalNonNegativeInt,
  toElementIndex: OptionalNonNegativeInt,
  fromX: OptionalFiniteNumber,
  fromY: OptionalFiniteNumber,
  toX: OptionalFiniteNumber,
  toY: OptionalFiniteNumber
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  const hasElementPair = value.fromElementIndex !== undefined && value.toElementIndex !== undefined
  const hasPartialElementPair =
    value.fromElementIndex !== undefined || value.toElementIndex !== undefined
  const coordinates = [value.fromX, value.fromY, value.toX, value.toY]
  const hasCoordinatePair = coordinates.every((coordinate) => coordinate !== undefined)
  const hasPartialCoordinatePair = coordinates.some((coordinate) => coordinate !== undefined)
  if (hasElementPair && hasCoordinatePair) {
    context.addIssue({
      code: 'custom',
      message: 'Drag accepts either element indexes or coordinate flags, not both'
    })
  }
  if (!hasElementPair && !hasCoordinatePair) {
    context.addIssue({
      code: 'custom',
      message: 'Drag requires --from-element-index and --to-element-index, or all coordinate flags'
    })
  }
  if (hasPartialElementPair && !hasElementPair) {
    context.addIssue({
      code: 'custom',
      message: 'Drag element targeting requires both --from-element-index and --to-element-index'
    })
  }
  if (hasPartialCoordinatePair && !hasCoordinatePair) {
    context.addIssue({
      code: 'custom',
      message: 'Drag coordinates require --from-x, --from-y, --to-x, and --to-y'
    })
  }
})

export const ComputerTypeTextInputSchema = ComputerObserveTargetBaseSchema.extend({
  text: requiredString('Missing text')
}).superRefine(validateComputerTarget)

export const ComputerPressKeyInputSchema = ComputerObserveTargetBaseSchema.extend({
  key: requiredString('Missing key')
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  const message = computerUsePressKeyValidationMessage(value.key)
  if (message) {
    context.addIssue({ code: 'custom', message })
  }
})

export const ComputerHotkeyInputSchema = ComputerObserveTargetBaseSchema.extend({
  key: requiredString('Missing key')
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  const message = computerUseHotkeyValidationMessage(value.key)
  if (message) {
    context.addIssue({ code: 'custom', message })
  }
})

export const ComputerPermissionsInputSchema = z.object({
  id: z.enum(['accessibility', 'screenshots']).optional()
})

export const ComputerPasteTextInputSchema = ComputerObserveTargetBaseSchema.extend({
  text: requiredString('Missing text')
}).superRefine(validateComputerTarget)

export const ComputerSetValueInputSchema = ComputerObserveTargetBaseSchema.extend({
  elementIndex: OptionalNonNegativeInt,
  value: z.unknown().refine((input): input is string => typeof input === 'string', {
    message: 'Missing value'
  })
}).superRefine((value, context) => {
  validateComputerTarget(value, context)
  if (value.elementIndex === undefined) {
    context.addIssue({ code: 'custom', message: 'Missing element index' })
  }
})

export type ComputerEmptyInput = z.output<typeof ComputerEmptyInputSchema>
export type ComputerObserveTargetInput = z.output<typeof ComputerObserveTargetInputSchema>
export type ComputerListAppsInput = z.output<typeof ComputerListAppsInputSchema>
export type ComputerListWindowsInput = z.output<typeof ComputerListWindowsInputSchema>
export type ComputerClickInput = z.output<typeof ComputerClickInputSchema>
export type ComputerSecondaryActionInput = z.output<typeof ComputerSecondaryActionInputSchema>
export type ComputerScrollInput = z.output<typeof ComputerScrollInputSchema>
export type ComputerDragInput = z.output<typeof ComputerDragInputSchema>
export type ComputerTypeTextInput = z.output<typeof ComputerTypeTextInputSchema>
export type ComputerPressKeyInput = z.output<typeof ComputerPressKeyInputSchema>
export type ComputerHotkeyInput = z.output<typeof ComputerHotkeyInputSchema>
export type ComputerPermissionsInput = z.output<typeof ComputerPermissionsInputSchema>
export type ComputerPasteTextInput = z.output<typeof ComputerPasteTextInputSchema>
export type ComputerSetValueInput = z.output<typeof ComputerSetValueInputSchema>
