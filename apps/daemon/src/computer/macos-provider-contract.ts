import type { ComputerProviderCapabilities } from '@yiru/runtime-protocol/workbench/runtime-types'

import type { ComputerProviderActionMethod } from './provider-action-validation'

export type MacOSProviderMethod =
  | 'handshake'
  | 'listApps'
  | 'listWindows'
  | 'getAppState'
  | ComputerProviderActionMethod
  | 'terminate'

export type MacOSProviderResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { code: string; message: string } }

export type PendingMacOSProviderRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export const REQUIRED_MACOS_PROVIDER_PROTOCOL_VERSION = 1

export function hasMacOSProviderCapability(
  capabilities: ComputerProviderCapabilities | null,
  group: keyof ComputerProviderCapabilities['supports'],
  capability: string
): boolean {
  const groupCapabilities = capabilities?.supports[group] as Record<string, boolean> | undefined
  return groupCapabilities?.[capability] === true
}

export function macOSActionCapabilityKey(
  method: ComputerProviderActionMethod
): keyof ComputerProviderCapabilities['supports']['actions'] {
  const keys = {
    click: 'click',
    drag: 'drag',
    hotkey: 'hotkey',
    pasteText: 'pasteText',
    performSecondaryAction: 'performAction',
    pressKey: 'pressKey',
    scroll: 'scroll',
    setValue: 'setValue',
    typeText: 'typeText'
  } satisfies Record<
    ComputerProviderActionMethod,
    keyof ComputerProviderCapabilities['supports']['actions']
  >
  return keys[method]
}
