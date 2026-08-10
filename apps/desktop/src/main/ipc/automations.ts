import { ipcMain } from 'electron'
import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '~shared/automations-types'

import type { AutomationService } from '../automations/service'

// Why: these channels are renderer replies to work dispatched by this local
// shell, not host capabilities. Keeping the Electron registration in the IPC
// adapter leaves AutomationService portable without inventing runtime methods.
export function registerAutomationHandlers(service: AutomationService): void {
  ipcMain.handle(
    'automations:runPrecheck',
    (
      _event,
      args: { automationId: string; runId: string }
    ): Promise<AutomationPrecheckResult | null> =>
      service.runPrecheck(args.automationId, args.runId)
  )
  ipcMain.handle(
    'automations:markDispatchResult',
    (_event, result: AutomationDispatchResult): Promise<AutomationRun> =>
      service.markDispatchResult(result)
  )
  ipcMain.handle('automations:rendererReady', (): void => {
    service.setRendererReady()
  })
}
