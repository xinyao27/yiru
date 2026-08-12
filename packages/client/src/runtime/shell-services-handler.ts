import { implement } from '@orpc/server'
import { shellServicesContract } from '@yiru/runtime-protocol/contract'
import { handleAutomationDispatchRequest } from '~renderer/components/automations/use-automation-dispatch-events'
import { buildWorkspaceSessionPayload } from '~renderer/components/editor/workspace-session'
import { persistWorkspaceSessionByHost } from '~renderer/components/editor/workspace-session-host-persistence'
import { handleRateLimitResumeDispatchRequest } from '~renderer/components/rate-limit-resume/use-rate-limit-resume-dispatch'
import { closeTerminalTab } from '~renderer/components/terminal/tab-actions'
import { useAppStore } from '~renderer/store'
import type { Automation, AutomationRun } from '~shared/automations-types'
import type { RateLimitResumeSchedule } from '~shared/rate-limit-resume/types'

import {
  closeBrowserTabViaShell,
  createBrowserTabViaShell,
  setBrowserTabProfileViaShell
} from './browser-tab-shell-requests'
import { readMobileMarkdownTab, saveMobileMarkdownTab } from './mobile-markdown-bridge'
import { shellClient } from './shell-client'
import { electronShellPlatformApi, type ShellPlatformApi } from './shell-platform-client'
import { shellSessionApi } from './shell-state-client'
import { createTerminalTabViaShell } from './terminal-create-shell-request'
import { mountTerminalTabViaShell } from './terminal-mount-shell-request'
import { revealTerminalSessionViaShell } from './terminal-reveal-shell-request'
import { handleShellServicesUICommand } from './ui-command-shell-request'
import { getWebShellApi, pickWebShellDirectories } from './web-shell-client'

function isWebShell(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

function getShellApi(): ShellPlatformApi {
  return isWebShell() ? getWebShellApi() : electronShellPlatformApi
}

export function createShellServicesRouter() {
  const implementer = implement(shellServicesContract)
  return implementer.router({
    ping: implementer.ping.handler(() => ({ pong: true as const, respondedAtMs: Date.now() })),
    // Why: Phase 5 slice S3 — job3 (driving the OS notification centre) needs
    // Electron's main-process Notification API, unavailable in this renderer
    // context, so this is a thin pass-through to the preload bridge that
    // reaches the real implementation in main/notifications/notifications.ts.
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
        await getShellApi().openUrl(url.toString())
        return { opened: true }
      }),
      pickDirectory: implementer.platform.pickDirectory.handler(async ({ input }) => {
        if (isWebShell()) {
          return { selections: await pickWebShellDirectories() }
        }
        const paths = input.allowMultiple
          ? await shellClient.repoHost.pickFolders()
          : [await getShellApi().pickDirectory({ defaultPath: input.defaultPath })].filter(
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
      // Why: Phase 5 slice S4b (terminal creation cluster, 切片 46) — the
      // actual logic lives in terminal-create-shell-request.ts, same
      // extraction shape as browser-tab-shell-requests.ts for the browser
      // tab trio, since use-ipc-events.ts is heavily contested.
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
    // Why: Phase 5 slice S6 (切片 47) — the browser tab trio. Unlike
    // terminal/mobileMarkdown above, the actual logic (store lookups, pinned-
    // tab confirmation) lives in a sibling module, browser-tab-shell-
    // requests.ts, rather than inline here — it moved out of use-ipc-events.ts
    // wholesale (that file only kept the `onRequestTabX` subscription
    // wiring), so keeping it in its own file rather than folding it into this
    // handler's `browser` block preserves the same one-module-one-feature
    // shape the extraction was for.
    browser: {
      tabCreate: implementer.browser.tabCreate.handler(({ input }) =>
        createBrowserTabViaShell(input)
      ),
      tabSetProfile: implementer.browser.tabSetProfile.handler(({ input }) =>
        setBrowserTabProfileViaShell(input)
      ),
      tabClose: implementer.browser.tabClose.handler(({ input }) => closeBrowserTabViaShell(input))
    },
    // Why: Phase 5 slice S5 — AutomationService/RateLimitResumeService hand
    // off dispatch here and get `{ accepted: true }` back immediately; the
    // actual work (worktree creation, launching the agent, waiting for it to
    // finish) can run for as long as the automation/resume takes, so it must
    // not block this RPC's response. Outcomes are reported back separately
    // through the existing local `markDispatchResult`/`markFired`/
    // `markFailed`/`markStale` IPC, unaffected by this reverse link.
    // The contract widens Automation/AutomationRun/RateLimitResumeSchedule to
    // their structurally-identical `Runtime*` contract counterparts (the
    // contract package can't import desktop's shared types); narrowing back
    // here is safe, same precedent as notifications.ts's
    // `toNotificationDispatchRequest`.
    automations: {
      dispatch: implementer.automations.dispatch.handler(({ input }) => {
        void handleAutomationDispatchRequest({
          automation: input.automation as Automation,
          run: input.run as AutomationRun,
          dispatchToken: input.dispatchToken
        })
        return { accepted: true }
      })
    },
    rateLimitResume: {
      dispatch: implementer.rateLimitResume.dispatch.handler(({ input }) => {
        void handleRateLimitResumeDispatchRequest(input as RateLimitResumeSchedule)
        return { accepted: true }
      })
    }
  })
}
