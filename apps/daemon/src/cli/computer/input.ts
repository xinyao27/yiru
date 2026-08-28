import {
  ComputerClickInputSchema,
  ComputerDragInputSchema,
  ComputerHotkeyInputSchema,
  ComputerObserveTargetInputSchema,
  ComputerPasteTextInputSchema,
  ComputerPressKeyInputSchema,
  ComputerScrollInputSchema,
  ComputerSecondaryActionInputSchema,
  ComputerSetValueInputSchema,
  ComputerTypeTextInputSchema,
  type ComputerClickInput,
  type ComputerDragInput,
  type ComputerHotkeyInput,
  type ComputerObserveTargetInput,
  type ComputerPasteTextInput,
  type ComputerPressKeyInput,
  type ComputerScrollInput,
  type ComputerSecondaryActionInput,
  type ComputerSetValueInput,
  type ComputerTypeTextInput
} from '@yiru/runtime-protocol/contract'

import { translate } from '../../i18n/translate'
import { hasFlag, readFlag, requireFlag } from '../arguments'

type ActionInput =
  | ComputerClickInput
  | ComputerDragInput
  | ComputerHotkeyInput
  | ComputerPasteTextInput
  | ComputerPressKeyInput
  | ComputerScrollInput
  | ComputerSecondaryActionInput
  | ComputerSetValueInput
  | ComputerTypeTextInput

export function parseComputerActionInput(
  action: 'click',
  args: string[]
): Promise<ComputerClickInput>
export function parseComputerActionInput(
  action: 'perform-secondary-action',
  args: string[]
): Promise<ComputerSecondaryActionInput>
export function parseComputerActionInput(
  action: 'scroll',
  args: string[]
): Promise<ComputerScrollInput>
export function parseComputerActionInput(action: 'drag', args: string[]): Promise<ComputerDragInput>
export function parseComputerActionInput(
  action: 'type-text',
  args: string[]
): Promise<ComputerTypeTextInput>
export function parseComputerActionInput(
  action: 'press-key',
  args: string[]
): Promise<ComputerPressKeyInput>
export function parseComputerActionInput(
  action: 'hotkey',
  args: string[]
): Promise<ComputerHotkeyInput>
export function parseComputerActionInput(
  action: 'paste-text',
  args: string[]
): Promise<ComputerPasteTextInput>
export function parseComputerActionInput(
  action: 'set-value',
  args: string[]
): Promise<ComputerSetValueInput>
export async function parseComputerActionInput(
  action: string,
  args: string[]
): Promise<ActionInput> {
  const target = targetInput(args)
  switch (action) {
    case 'click':
      return ComputerClickInputSchema.parse({
        ...target,
        clickCount: optionalInteger(args, '--click-count'),
        elementIndex: optionalInteger(args, '--element-index'),
        mouseButton: readFlag(args, '--mouse-button'),
        x: optionalNumber(args, '--x'),
        y: optionalNumber(args, '--y')
      })
    case 'perform-secondary-action':
      return ComputerSecondaryActionInputSchema.parse({
        ...target,
        action: requireFlag(args, '--action'),
        elementIndex: optionalInteger(args, '--element-index')
      })
    case 'scroll':
      return ComputerScrollInputSchema.parse({
        ...target,
        direction: requireFlag(args, '--direction'),
        elementIndex: optionalInteger(args, '--element-index'),
        pages: optionalNumber(args, '--pages'),
        x: optionalNumber(args, '--x'),
        y: optionalNumber(args, '--y')
      })
    case 'drag':
      return ComputerDragInputSchema.parse({
        ...target,
        fromElementIndex: optionalInteger(args, '--from-element-index'),
        fromX: optionalNumber(args, '--from-x'),
        fromY: optionalNumber(args, '--from-y'),
        toElementIndex: optionalInteger(args, '--to-element-index'),
        toX: optionalNumber(args, '--to-x'),
        toY: optionalNumber(args, '--to-y')
      })
    case 'type-text':
      return ComputerTypeTextInputSchema.parse({
        ...target,
        text: await readTextPayload(args, 'text')
      })
    case 'press-key':
      return ComputerPressKeyInputSchema.parse({ ...target, key: requireFlag(args, '--key') })
    case 'hotkey':
      return ComputerHotkeyInputSchema.parse({ ...target, key: requireFlag(args, '--key') })
    case 'paste-text':
      return ComputerPasteTextInputSchema.parse({
        ...target,
        text: await readTextPayload(args, 'text')
      })
    case 'set-value':
      return ComputerSetValueInputSchema.parse({
        ...target,
        elementIndex: optionalInteger(args, '--element-index'),
        value: await readTextPayload(args, 'value')
      })
    default:
      throw new Error('computer_action_unsupported')
  }
}

export function parseComputerObserveInput(args: string[]): ComputerObserveTargetInput {
  return ComputerObserveTargetInputSchema.parse(targetInput(args))
}

export function parsePermissionId(args: string[]): 'accessibility' | 'screenshots' | undefined {
  const id = readFlag(args, '--id')
  if (id === undefined || id === 'accessibility' || id === 'screenshots') {
    return id
  }
  throw new Error(translate('--id must be accessibility or screenshots'))
}

function targetInput(args: string[]): Record<string, unknown> {
  const session = readFlag(args, '--session')
  const worktree = readFlag(args, '--worktree')
  const windowId = optionalInteger(args, '--window-id')
  const windowIndex = optionalInteger(args, '--window-index')
  return {
    app: requireFlag(args, '--app'),
    ...(session ? { session } : {}),
    ...(worktree ? { worktree } : {}),
    ...(windowId !== undefined ? { windowId } : {}),
    ...(windowIndex !== undefined ? { windowIndex } : {}),
    ...(hasFlag(args, '--no-screenshot') ? { noScreenshot: true } : {}),
    ...(hasFlag(args, '--restore-window') ? { restoreWindow: true } : {})
  }
}

async function readTextPayload(args: string[], name: 'text' | 'value'): Promise<string> {
  const flag = `--${name}`
  const stdinFlag = `--${name}-stdin`
  if (hasFlag(args, stdinFlag)) {
    if (readFlag(args, flag) !== undefined) {
      throw new Error(
        translate('Use either {{flag}} or {{stdinFlag}}, not both', { flag, stdinFlag })
      )
    }
    return await Bun.stdin.text()
  }
  const value = readFlag(args, flag)
  if (value === undefined) {
    throw new Error(translate('Missing required {{flag}}', { flag }))
  }
  return value
}

function optionalInteger(args: string[], name: string): number | undefined {
  const value = optionalNumber(args, name)
  if (value !== undefined && !Number.isSafeInteger(value)) {
    throw new Error(translate('{{flag}} must be an integer', { flag: name }))
  }
  return value
}

function optionalNumber(args: string[], name: string): number | undefined {
  const raw = readFlag(args, name)
  if (raw === undefined) {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(translate('{{flag}} must be a number', { flag: name }))
  }
  return value
}
