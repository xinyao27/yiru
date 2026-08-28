import { validateComputerClipboardPasteTextWithBoundedYield } from './clipboard-paste-validation'
import type { ComputerProviderActionMethod } from './provider-action-validation'

export function validateComputerProviderPasteText(
  method: ComputerProviderActionMethod,
  params: unknown
): Promise<void> | void {
  if (method !== 'pasteText' || !params || typeof params !== 'object') {
    return
  }
  const text = (params as Record<string, unknown>).text
  if (typeof text === 'string') {
    return validateComputerClipboardPasteTextWithBoundedYield(text)
  }
}
