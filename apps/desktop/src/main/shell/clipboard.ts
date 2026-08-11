import type { Store } from '../persistence'
import { createClipboardService, type ClipboardService } from '../window/clipboard-ipc-handlers'

let clipboardService: ClipboardService | null = null

export function initializeShellClipboardService(store: Store): void {
  clipboardService = createClipboardService(store)
}

export function getShellClipboardService(): ClipboardService {
  if (!clipboardService) {
    throw new Error('shell clipboard service is not initialized')
  }
  return clipboardService
}
