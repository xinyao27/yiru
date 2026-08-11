import type { BrowserWindow } from 'electron'
import type { FridaySession } from '~shared/friday-types'

import type { FridayService } from './service'

let fridayService: FridayService | null = null
let fridayRendererId: number | null = null

export function initializeShellFridayService(
  mainWindow: BrowserWindow,
  service: FridayService
): void {
  fridayService = service
  fridayRendererId = mainWindow.webContents.id
}

function requireFridayService(rendererId: number): FridayService {
  if (!fridayService || fridayRendererId !== rendererId) {
    throw new Error('friday_sender_not_allowed')
  }
  return fridayService
}

export function getOrCreateShellFridaySession(rendererId: number): Promise<FridaySession> {
  return requireFridayService(rendererId).getOrCreate()
}

export function restartShellFridaySession(rendererId: number): Promise<FridaySession> {
  return requireFridayService(rendererId).restart()
}
