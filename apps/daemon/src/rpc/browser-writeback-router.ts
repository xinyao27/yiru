import type { BrowserWritebackService } from '../browser-writeback/service'
import type { WorkspaceEventLog } from '../events/log'
import { daemonImplementation } from './contract'

export function createBrowserWritebackRouter(
  browserWriteback: BrowserWritebackService,
  events: WorkspaceEventLog
) {
  return {
    applyColor: daemonImplementation.browserWriteback.applyColor.handler(async ({ input }) => {
      const result = await browserWriteback.applyColor(input)
      events.append(input.projectId, 'browser.color.writeback-started', {
        color: input.color,
        terminalHandle: result.terminalHandle,
        worktreeId: input.worktreeId
      })
      return result
    }),
    applyCss: daemonImplementation.browserWriteback.applyCss.handler(async ({ input }) => {
      const result = await browserWriteback.applyCss(input)
      events.append(input.projectId, 'browser.css.writeback-started', {
        pageUrl: input.pageUrl,
        terminalHandle: result.terminalHandle,
        worktreeId: input.worktreeId
      })
      return result
    }),
    locateElement: daemonImplementation.browserWriteback.locateElement.handler(
      async ({ input }) => {
        const result = await browserWriteback.locateElement(input)
        events.append(input.projectId, 'browser.element.agent-started', {
          componentName: input.evidence.componentName,
          fileName: input.evidence.fileName,
          pageUrl: input.pageUrl,
          terminalHandle: result.terminalHandle,
          worktreeId: input.worktreeId
        })
        return result
      }
    ),
    recordVerification: daemonImplementation.browserWriteback.recordVerification.handler(
      async ({ input }) => {
        await browserWriteback.requireVerificationTarget(input)
        const event = events.append(input.projectId, 'browser.writeback.verified', {
          detail: input.detail,
          pageUrl: input.pageUrl,
          success: input.success,
          terminalHandle: input.terminalHandle,
          worktreeId: input.worktreeId
        })
        return { eventId: event.id }
      }
    )
  }
}
