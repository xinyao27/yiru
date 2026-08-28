import { implement } from '@orpc/server'
import { shellServicesContract } from '@yiru/runtime-protocol/contract'
import type { RateLimitResumeSchedule } from '@yiru/runtime-protocol/workbench/rate-limit-resume/types'
import { buildWorkspaceSessionPayload } from '~renderer/editor/workspace-session'
import { persistWorkspaceSessionByHost } from '~renderer/editor/workspace-session-host-persistence'
import { handleRateLimitResumeDispatchRequest } from '~renderer/rate-limit-resume/use-rate-limit-resume-dispatch'
import { useAppStore } from '~renderer/store/state'
import { closeTerminalTab } from '~renderer/terminal/tab-actions'

import { executeHostBrowserCommand } from '../browser-tab-projection/command'
import { readMobileMarkdownTab, saveMobileMarkdownTab } from './mobile-markdown-bridge'
import { shellClient } from './shell-client'
import { shellSessionApi } from './shell-state-client'
import { createTerminalTabViaShell } from './terminal-create-shell-request'
import { mountTerminalTabViaShell } from './terminal-mount-shell-request'
import { revealTerminalSessionViaShell } from './terminal-reveal-shell-request'
import { handleShellServicesUICommand } from './ui-command-shell-request'
import { pickWebShellDirectories } from './web-shell-client'

function isWebShell(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

export function createShellServicesRouter() {
  const implementer = implement(shellServicesContract)
  return implementer.router({
    ping: implementer.ping.handler(() => ({ pong: true as const, respondedAtMs: Date.now() })),
    // Why: Phase 5 slice S3 — job3 (driving the OS notification centre) needs
    // Electron's main-process Notification API, unavailable in this renderer
    // context, so this delegates through the authenticated shell notification
    // contract to main/notifications/notifications.ts.
    notifications: {
      display: implementer.notifications.display.handler(({ input }) =>
        shellClient.notifications.displayNative(input)
      ),
      dismiss: implementer.notifications.dismiss.handler(({ input }) =>
        shellClient.notifications.dismissNative(input.notificationIds)
      )
    },
    ui: {
      command: implementer.ui.command.handler(({ input }) => handleShellServicesUICommand(input))
    },
    platform: {
      openExternal: implementer.platform.openExternal.handler(async ({ input }) => {
        let url: URL
        try {
          url = new URL(input.url)
        } catch {
          return { opened: false }
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          return { opened: false }
        }
        await shellClient.shell.openUrl(url.toString())
        return { opened: true }
      }),
      pickDirectory: implementer.platform.pickDirectory.handler(async ({ input }) => {
        if (isWebShell()) {
          return { selections: await pickWebShellDirectories() }
        }
        const paths = input.allowMultiple
          ? await shellClient.repoHost.pickFolders()
          : [await shellClient.shell.pickDirectory({ defaultPath: input.defaultPath })].filter(
              (path): path is string => path !== null
            )
        return { selections: paths.map((path) => ({ kind: 'path' as const, path })) }
      }),
      // Why: the browser has no tray/global-attention equivalent. Electron's
      // tray adapter remains in main and reports availability independently.
      requestAttention: implementer.platform.requestAttention.handler(() => ({
        kind: 'shell-unavailable' as const
      }))
    },
    // Why: Phase 5 slice S4b — mirrors the closeTerminalTab request/reply that
    // `terminal-tab-close-request-relay.ts` used to relay: reject a pinned tab
    // by throwing (the caller's real answer, not a shell-unavailable case),
    // otherwise persist the workspace session before acking so the runtime's
    // "closed" reply always trails a durable session write.
    terminal: {
      closeTab: implementer.terminal.closeTab.handler(
        ({ input }) =>
          new Promise((resolve, reject) => {
            let responded = false
            const respond = (error?: string): void => {
              if (responded) {
                return
              }
              responded = true
              if (error) {
                reject(new Error(error))
              } else {
                resolve({ closed: true })
              }
            }
            closeTerminalTab(input.tabId, {
              rejectPinned: true,
              onCancel: () => respond('terminal_tab_pinned'),
              onClosed: () => {
                void (async () => {
                  const state = useAppStore.getState()
                  await persistWorkspaceSessionByHost(
                    shellSessionApi,
                    buildWorkspaceSessionPayload(state),
                    state
                  )
                  respond()
                })().catch((error: unknown) => {
                  respond(error instanceof Error ? error.message : 'terminal_tab_close_failed')
                })
              }
            })
          })
      ),
      create: implementer.terminal.create.handler(({ input }) => createTerminalTabViaShell(input)),
      mount: implementer.terminal.mount.handler(({ input }) => mountTerminalTabViaShell(input)),
      // Why: `reveal` adopts a PTY main already spawned, unlike `create`
      // above where the renderer owns the spawn — see the design note above
      // ShellServicesTerminalRevealInputSchema in contract/shell-services.ts.
      // Actual logic lives in terminal-reveal-shell-request.ts.
      reveal: implementer.terminal.reveal.handler(({ input }) =>
        revealTerminalSessionViaShell(input)
      )
    },
    // Why: Phase 5 slice S4a — mirrors the closeTab handler above: the actual
    // read/save work already lived in a self-contained renderer module
    // (mobile-markdown-bridge.ts's editor-draft/save-queue logic), so the
    // handler is a direct call, not a pass-through IPC hop like notifications.
    mobileMarkdown: {
      read: implementer.mobileMarkdown.read.handler(({ input }) =>
        readMobileMarkdownTab(input.worktreeId, input.tabId)
      ),
      save: implementer.mobileMarkdown.save.handler(({ input }) =>
        saveMobileMarkdownTab(input.worktreeId, input.tabId, input.baseVersion, input.content)
      )
    },
    browser: {
      command: implementer.browser.command.handler(async ({ input }) => ({
        result: await executeHostBrowserCommand(input.method, input.input)
      }))
    },
    // Why: the scheduler needs an immediate acknowledgement while the agent
    // may keep running for much longer; completion is reported separately.
    rateLimitResume: {
      dispatch: implementer.rateLimitResume.dispatch.handler(({ input }) => {
        void handleRateLimitResumeDispatchRequest(input as RateLimitResumeSchedule)
        return { accepted: true }
      })
    }
  })
}
