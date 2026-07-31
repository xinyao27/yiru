import { Gear as Settings, ArrowSquareOut as ExternalLink } from '@phosphor-icons/react'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import { Badge } from '~renderer/components/ui/badge'
import { Button } from '~renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/components/ui/dialog'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'

type LinkRoutingPreferenceDialogOptions = {
  url?: string
  preview?: boolean
  openLinksInAppDefault?: boolean
}

type LinkRoutingPreferenceDialogRequest = {
  id: number
  options: LinkRoutingPreferenceDialogOptions
  resolve: (openInYiru: boolean) => void
}

type LinkRoutingPreferenceDialogContextValue = (
  options?: LinkRoutingPreferenceDialogOptions
) => Promise<boolean>

const PREVIEW_STORAGE_KEY = 'yiru.previewLinkRoutingPreferenceDialog'
const PREVIEW_DEFAULT_STORAGE_KEY = `${PREVIEW_STORAGE_KEY}.default`
const LinkRoutingPreferenceDialogContext =
  createContext<LinkRoutingPreferenceDialogContextValue | null>(null)

// Why: Vite HMR (and rare dual-module graphs) can replace this file's
// createContext identity while App still mounts the previous Provider. A
// window-scoped bridge keeps TerminalPane from crashing the workbench when
// React context identity drifts.
const LINK_ROUTING_PREFERENCE_REQUEST_KEY = '__yiruLinkRoutingPreferenceRequest__'

type LinkRoutingPreferenceRequestHost = typeof globalThis & {
  [LINK_ROUTING_PREFERENCE_REQUEST_KEY]?: LinkRoutingPreferenceDialogContextValue | null
}

function registerLinkRoutingPreferenceRequest(
  requestPreference: LinkRoutingPreferenceDialogContextValue | null
): void {
  ;(globalThis as LinkRoutingPreferenceRequestHost)[LINK_ROUTING_PREFERENCE_REQUEST_KEY] =
    requestPreference
}

function getRegisteredLinkRoutingPreferenceRequest(): LinkRoutingPreferenceDialogContextValue | null {
  return (
    (globalThis as LinkRoutingPreferenceRequestHost)[LINK_ROUTING_PREFERENCE_REQUEST_KEY] ?? null
  )
}

function resolveOpenLinksInAppDefault(): boolean {
  return useAppStore.getState().settings?.openLinksInApp === true
}

function displayHostForUrl(url: string | undefined): string | null {
  if (!url) {
    return null
  }
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function LinkRoutingPreferenceDialogProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const nextIdRef = useRef(0)
  const [queue, setQueue] = useState<LinkRoutingPreferenceDialogRequest[]>([])
  const activeRequest = queue[0] ?? null
  const activeRequestRef = useRef<LinkRoutingPreferenceDialogRequest | null>(activeRequest)
  const setContextualToursBlockingSurfaceVisible = useAppStore(
    (s) => s.setContextualToursBlockingSurfaceVisible
  )
  const lastDisplayedRequestRef = useRef<LinkRoutingPreferenceDialogRequest | null>(activeRequest)
  activeRequestRef.current = activeRequest
  if (activeRequest) {
    lastDisplayedRequestRef.current = activeRequest
  }
  // Why: Radix keeps dialog content mounted while closing; keep copy stable during exit animation.
  const displayedRequest = activeRequest ?? lastDisplayedRequestRef.current
  const displayHost = displayHostForUrl(displayedRequest?.options.url)
  const openLinksInAppDefault = displayedRequest?.options.openLinksInAppDefault === true
  const isMac = navigator.userAgent.includes('Mac')
  const systemBrowserShortcutKeys = isMac ? ['⇧', '⌘'] : ['Shift', 'Ctrl']

  useEffect(() => {
    setContextualToursBlockingSurfaceVisible(activeRequest !== null)
    return () => setContextualToursBlockingSurfaceVisible(false)
  }, [activeRequest, setContextualToursBlockingSurfaceVisible])

  const requestPreference = useCallback<LinkRoutingPreferenceDialogContextValue>((options = {}) => {
    return new Promise((resolve) => {
      const request: LinkRoutingPreferenceDialogRequest = {
        id: nextIdRef.current,
        options,
        resolve
      }
      nextIdRef.current += 1
      setQueue((currentQueue) => [...currentQueue, request])
    })
  }, [])

  // Why: register before children commit so first-paint consumers in a drifted
  // context module still resolve the live dialog instead of throwing.
  registerLinkRoutingPreferenceRequest(requestPreference)
  useEffect(() => {
    registerLinkRoutingPreferenceRequest(requestPreference)
    return () => {
      if (getRegisteredLinkRoutingPreferenceRequest() === requestPreference) {
        registerLinkRoutingPreferenceRequest(null)
      }
    }
  }, [requestPreference])

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return
    }
    if (window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) !== '1') {
      return
    }
    const previewDefault = window.sessionStorage.getItem(PREVIEW_DEFAULT_STORAGE_KEY)
    window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY)
    window.sessionStorage.removeItem(PREVIEW_DEFAULT_STORAGE_KEY)
    void requestPreference({
      openLinksInAppDefault: previewDefault === 'yiru',
      preview: true,
      url: 'https://github.com/xinyao27/yiru/pull/1234'
    })
  }, [requestPreference])

  const settleActiveRequest = useCallback((openInYiru: boolean) => {
    const request = activeRequestRef.current
    if (!request) {
      return
    }
    request.resolve(openInYiru)
    setQueue((currentQueue) => {
      if (currentQueue[0]?.id === request.id) {
        return currentQueue.slice(1)
      }
      return currentQueue.filter((queuedRequest) => queuedRequest.id !== request.id)
    })
  }, [])

  return (
    <LinkRoutingPreferenceDialogContext.Provider value={requestPreference}>
      {children}
      <Dialog
        open={activeRequest !== null}
        onOpenChange={(open) => !open && settleActiveRequest(false)}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="!z-[140]"
          className="!z-[150] gap-4 p-0 sm:max-w-[520px]"
        >
          <div className="border-border bg-muted/30 border-b px-6 pt-5 pb-4">
            <DialogHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="bg-background/70 text-muted-foreground">
                  {translate(
                    'auto.components.link.routing.preference.dialog.badge',
                    'Terminal link'
                  )}
                </Badge>
                {displayedRequest?.options.preview ? (
                  <Badge variant="secondary">
                    {translate('auto.components.link.routing.preference.dialog.preview', 'Preview')}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl leading-tight">
                  {openLinksInAppDefault
                    ? translate(
                        'auto.components.link.routing.preference.dialog.keep.title',
                        "Keep terminal links in Yiru's browser?"
                      )
                    : translate(
                        'auto.components.link.routing.preference.dialog.title',
                        "Open terminal links in Yiru's browser?"
                      )}
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  {openLinksInAppDefault
                    ? translate(
                        'auto.components.link.routing.preference.dialog.keep.description',
                        'Or use your system browser by default.'
                      )
                    : translate(
                        'auto.components.link.routing.preference.dialog.description',
                        "Use Yiru's browser for terminal links, or keep your system browser."
                      )}
                </DialogDescription>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-6">
            {displayHost ? (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span>
                  {translate('auto.components.link.routing.preference.dialog.link.label', 'Link')}
                </span>
                <span className="border-border bg-muted/30 border px-2 py-1 font-mono">
                  {displayHost}
                </span>
              </div>
            ) : null}

            <div className="border-border bg-muted/20 text-muted-foreground flex gap-2 border p-3 text-xs leading-relaxed">
              <Settings className="mt-0.5 size-3.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  {translate(
                    'auto.components.link.routing.preference.dialog.yiru.note',
                    'Yiru can use imported cookies for logged-in sites.'
                  )}
                </p>
                <p>
                  {translate(
                    'auto.components.link.routing.preference.dialog.settings.note',
                    'Change this later in Settings → Browser.'
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span>
                    {translate(
                      'auto.components.link.routing.preference.dialog.shortcut.note.prefix',
                      'When links open in Yiru,'
                    )}
                  </span>
                  <ShortcutKeyCombo
                    keys={systemBrowserShortcutKeys}
                    keyCapClassName="min-w-0 px-1 py-0 text-[10px] "
                    separatorClassName="text-[10px] text-muted-foreground"
                  />
                  <span>
                    {translate(
                      'auto.components.link.routing.preference.dialog.shortcut.note.suffix',
                      'click opens system browser once.'
                    )}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-border bg-muted/20 border-t px-6 py-4 sm:justify-between">
            <Button variant="outline" onClick={() => settleActiveRequest(false)}>
              <ExternalLink className="size-4" />
              {translate(
                'auto.components.link.routing.preference.dialog.system.button',
                'Use system browser'
              )}
            </Button>
            <Button autoFocus onClick={() => settleActiveRequest(true)}>
              {openLinksInAppDefault
                ? translate(
                    'auto.components.link.routing.preference.dialog.keep.yiru.button',
                    'Keep Yiru'
                  )
                : translate(
                    'auto.components.link.routing.preference.dialog.yiru.button',
                    'Open in Yiru'
                  )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LinkRoutingPreferenceDialogContext.Provider>
  )
}

export function useLinkRoutingPreferenceDialog(): LinkRoutingPreferenceDialogContextValue {
  const requestPreference = useContext(LinkRoutingPreferenceDialogContext)
  if (requestPreference) {
    return requestPreference
  }
  const registered = getRegisteredLinkRoutingPreferenceRequest()
  if (registered) {
    return registered
  }
  // Why: never take down terminal.workbench for a missing dialog host; fall
  // back to the persisted open-links default until a provider registers again.
  return async () => resolveOpenLinksInAppDefault()
}
