import { useEffect, useRef } from 'react'
import { DownloadSimple } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { createBrowserWebviewElement } from '~renderer/runtime/browser-webview-element'
import { SKILLS_MARKETPLACE_PARTITION } from '~shared/constants'

import type { SkillInstallRequest } from './install-dialog'
import { SKILLS_MARKETPLACE_URL } from './marketplace-url'

export type SkillsMarketplaceProps = {
  /** Reports where the guest navigated, so the install actions can light up. */
  onUrlChange: (url: string) => void
}

export function SkillsMarketplace({ onUrlChange }: SkillsMarketplaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onUrlChangeRef = useRef(onUrlChange)

  useEffect(() => {
    onUrlChangeRef.current = onUrlChange
  }, [onUrlChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const webview = createBrowserWebviewElement()
    webview.setAttribute('partition', SKILLS_MARKETPLACE_PARTITION)
    webview.setAttribute('src', SKILLS_MARKETPLACE_URL)
    // Why: registry pages link out with target=_blank. Main's guest policy sends
    // a popup from an unregistered guest to the OS browser, but only if the
    // guest is allowed to request a window in the first place.
    webview.setAttribute('allowpopups', '')
    webview.style.flex = '1'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    // Why: skills.sh paints its own background late; white matches ordinary
    // browser behavior instead of leaking Yiru chrome through the guest.
    webview.style.background = '#ffffff'
    container.appendChild(webview)
    // Why: switching tabs unmounts the guest, so the reported URL has to fall
    // back to the entry page until the reloaded guest reports its own.
    onUrlChangeRef.current(SKILLS_MARKETPLACE_URL)

    const syncCurrentUrl = (): void => {
      try {
        onUrlChangeRef.current(webview.getURL())
      } catch {
        // Why: Electron only exposes the getter once the guest has attached.
      }
    }
    webview.addEventListener('did-navigate', syncCurrentUrl)
    webview.addEventListener('did-navigate-in-page', syncCurrentUrl)
    webview.addEventListener('did-stop-loading', syncCurrentUrl)

    return () => {
      webview.removeEventListener('did-navigate', syncCurrentUrl)
      webview.removeEventListener('did-navigate-in-page', syncCurrentUrl)
      webview.removeEventListener('did-stop-loading', syncCurrentUrl)
      webview.remove()
    }
  }, [])

  return <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden" />
}

export type SkillsMarketplaceActionsProps = {
  /** The skill the guest is currently showing, or null off a skill page. */
  installTarget: SkillInstallRequest | null
  onInstall: (request: SkillInstallRequest) => void
}

export function SkillsMarketplaceActions({
  installTarget,
  onInstall
}: SkillsMarketplaceActionsProps): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onInstall({ source: '', skillName: '' })}
      >
        {translate(
          'auto.components.skills.SkillsMarketplace.installFromSource',
          'Install from source'
        )}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!installTarget}
        onClick={() => {
          if (installTarget) {
            onInstall(installTarget)
          }
        }}
      >
        <DownloadSimple weight="regular" className="size-3.5" />
        {translate('auto.components.skills.SkillsMarketplace.installCurrent', 'Install this skill')}
      </Button>
    </div>
  )
}
