import { ipcMain } from 'electron'

import type { MemorySnapshot } from '../../shared/types'
import { collectMemorySnapshot } from '../memory/collector'
import type { Store } from '../persistence'

export function registerMemoryHandlers(store: Store): void {
  ipcMain.handle('memory:getSnapshot', (): Promise<MemorySnapshot> => collectMemorySnapshot(store))
}
