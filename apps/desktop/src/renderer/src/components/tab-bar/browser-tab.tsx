import { useSortable } from '@dnd-kit/sortable'
import {
  Globe,
  X,
  ArrowSquareOut as ExternalLink,
  Copy,
  PushPin as Pin,
  PushPinSlash as PinOff,
  Sidebar as PanelRightClose
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { redactKagiSessionToken } from '../../../../shared/browser-url'
import { YIRU_BROWSER_BLANK_URL } from '../../../../shared/constants'
import type { BrowserTab as BrowserTabState } from '../../../../shared/types'
import { getLiveBrowserUrl } from '../browser-pane/browser-runtime'
import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import {
  getDropIndicatorClasses,
  getTabDividerClasses,
  getTabRootStateClasses,
  type DropIndicator
} from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from './sortable-tab'
import { TabCloseButton } from './tab-close-button'
import { TAB_ROOT_CLASSES } from './tab-root-classes'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES, TAB_LABEL_WIDTH_CLASSES } from './tab-width-rules'
import { TabWorkspaceLayoutMenuSection } from './tab-workspace-layout-menu-section'

function formatBrowserTabUrlLabel(url: string): string {
  if (url === YIRU_BROWSER_BLANK_URL || url === 'about:blank') {
    return 'New Tab'
  }
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

export function getBrowserTabLabel(tab: BrowserTabState): string {
  if (
    !tab.title ||
    tab.title === tab.url ||
    tab.title === YIRU_BROWSER_BLANK_URL ||
    tab.title === 'about:blank'
  ) {
    return formatBrowserTabUrlLabel(tab.url)
  }
  return tab.title || tab.url
}

function isBlankBrowserTab(tab: BrowserTabState): boolean {
  return tab.url === YIRU_BROWSER_BLANK_URL || tab.url === 'about:blank'
}

type FailedFavicon = {
  tabId: string
  faviconUrl: string
}

function BrowserTabFavicon({
  tabId,
  faviconUrl
}: {
  tabId: string
  faviconUrl: string | null
}): React.JSX.Element {
  const displayFaviconUrl = faviconUrl?.trim() ? faviconUrl : null
  const [failedFavicon, setFailedFavicon] = useState<FailedFavicon | null>(null)

  // Why: reset during render so a new favicon identity retries before the tab
  // commits one frame with the stale fallback icon.
  if (
    failedFavicon &&
    (failedFavicon.tabId !== tabId || failedFavicon.faviconUrl !== displayFaviconUrl)
  ) {
    setFailedFavicon(null)
  }

  const currentFaviconFailed =
    failedFavicon?.tabId === tabId && failedFavicon.faviconUrl === displayFaviconUrl

  if (displayFaviconUrl && !currentFaviconFailed) {
    return (
      <img
        src={displayFaviconUrl}
        alt=""
        aria-hidden
        draggable={false}
        // Why: transparent dark/light-mode favicons can disappear against tab
        // chrome; a token-colored 1px shadow keeps the 16px mark legible.
        className="mr-1 size-4 shrink-0 rounded-sm object-contain drop-shadow-[0_0_1px_var(--foreground)]"
        onError={() => setFailedFavicon({ tabId, faviconUrl: displayFaviconUrl })}
      />
    )
  }

  return <Globe className="mr-1 size-4 shrink-0 text-blue-500" />
}

export default function BrowserTab({
  tab,
  isActive,
  isPinned,
  hasTabsToRight,
  onActivate,
  onClose,
  onCloseToRight,
  onDuplicate,
  onTogglePin,
  dragData,
  dropIndicator
}: {
  tab: BrowserTabState
  isActive: boolean
  isPinned: boolean
  hasTabsToRight: boolean
  onActivate: () => void
  onClose: () => void
  onCloseToRight: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}): React.JSX.Element {
  // Why: no transform/transition/isDragging styling — the drag design is
  // that tabs stay visually anchored; only the blue insertion bar moves.
  const { attributes, listeners, setNodeRef } = useSortable({
    id: tab.id,
    data: dragData
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPoint, setMenuPoint] = useState({ x: 0, y: 0 })

  // Why: about:blank and other non-http URLs should not be sent to the
  // system browser. Disable the context menu item instead of silently
  // calling shell.openUrl with an unsupported URL.
  const openInBrowserUrl = redactKagiSessionToken(getLiveBrowserUrl(tab.id) ?? tab.url)
  let isHttpUrl = false
  try {
    const parsed = new URL(openInBrowserUrl)
    isHttpUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    // invalid URL — leave disabled
  }
  const tabLabel = getBrowserTabLabel(tab)

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  // Why: Electron <webview> elements run in a separate process, so clicking
  // inside one never dispatches a pointerdown on the renderer document. Radix
  // DropdownMenu relies on document pointerdown for outside-click detection,
  // so it misses webview clicks. Listening for window blur catches the moment
  // focus leaves the renderer (including into a webview).
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const dismiss = (): void => setMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [menuOpen])

  // Why: defer activation to pointer-up so dragging the tab (reorder / move into
  // another pane / split) does not switch the active tab mid-gesture.
  const { onPointerDown: onTabPointerDown } = useTabStripPointerActivation({ onActivate })

  const tabRoot = (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      data-pinned={isPinned ? 'true' : 'false'}
      {...attributes}
      {...listeners}
      className={cn(
        TAB_ROOT_CLASSES,
        getTabDividerClasses(hasTabsToRight),
        getDropIndicatorClasses(dropIndicator ?? null),
        getTabRootStateClasses(isActive)
      )}
      onPointerDown={(e) => {
        onTabPointerDown(
          e,
          listeners?.onPointerDown as ((event: React.PointerEvent<Element>) => void) | undefined
        )
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
        }
      }}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          if (isPinned) {
            return
          }
          onClose()
        }
      }}
    >
      {/* Why: the browser tab icon is the only non-terminal, non-editor
          surface in the tab strip. Coloring the Globe blue (matching the
          in-app browser's identity and the default tab insertion bar)
          gives it a distinct, recognizable anchor so users can spot
          browser tabs at a glance even when the strip is saturated. We
          keep full color on both active and inactive tabs — dimming to
          muted-foreground made the icon read as "disabled" in practice. */}
      <BrowserTabFavicon tabId={tab.id} faviconUrl={tab.faviconUrl} />
      {isPinned && <Pin className="text-muted-foreground mr-1 size-4 shrink-0" aria-hidden />}
      {menuOpen ? (
        <span className={cn(TAB_LABEL_WIDTH_CLASSES, 'mr-1')}>{tabLabel}</span>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn(TAB_LABEL_WIDTH_CLASSES, 'mr-1')}>{tabLabel}</span>}
          />
          <TooltipContent
            side="bottom"
            sideOffset={6}
            className="max-w-80 text-left break-words whitespace-normal"
          >
            {tabLabel}
          </TooltipContent>
        </Tooltip>
      )}
      {tab.loading && !tab.loadError && !isBlankBrowserTab(tab) && (
        <span className="mr-1 size-1.5 shrink-0 rounded-full bg-sky-500/80" />
      )}
      {!isPinned && (
        <TabCloseButton
          className="right-1"
          ariaLabel={translate(
            'auto.components.tab.bar.SortableTab.6df69d9388',
            'Close tab {{value0}}',
            { value0: tabLabel }
          )}
          onClose={onClose}
        />
      )}
    </div>
  )

  return (
    <>
      <div
        className={TAB_CONTAINER_WIDTH_CLASSES}
        onContextMenuCapture={(event) => {
          event.preventDefault()
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
          setMenuPoint({ x: event.clientX, y: event.clientY })
          setMenuOpen(true)
        }}
      >
        {tabRoot}
      </div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger
          render={
            <button
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none fixed size-px opacity-0"
              style={{ left: menuPoint.x, top: menuPoint.y }}
            />
          }
        />
        <DropdownMenuContent
          className="border-border/80 min-w-[11rem] rounded-[11px] p-1 shadow-[0_16px_36px_rgba(0,0,0,0.24)]"
          sideOffset={0}
          align="start"
        >
          <TabWorkspaceLayoutMenuSection
            unifiedTabId={dragData.unifiedTabId}
            groupId={dragData.groupId}
            trailingSeparator
          />
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="size-4" />
            {translate('auto.components.tab.bar.BrowserTab.5d6e89891f', 'Duplicate Tab')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onTogglePin}>
            {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            {isPinned
              ? translate('auto.components.tab.bar.BrowserTab.c5aaee8c39', 'Unpin Tab')
              : translate('auto.components.tab.bar.BrowserTab.911542656f', 'Pin Tab')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => !isPinned && onClose()} disabled={isPinned}>
            <X className="size-4" />
            {translate('auto.components.tab.bar.BrowserTab.1611a1324b', 'Close')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
            <PanelRightClose className="size-4" />
            {translate('auto.components.tab.bar.BrowserTab.9dd880bd56', 'Close Tabs To The Right')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void window.api.shell.openUrl(openInBrowserUrl)}
            disabled={!isHttpUrl}
          >
            <ExternalLink className="size-4" />
            {translate('auto.components.tab.bar.BrowserTab.6e0bc8f3a8', 'Open In Browser')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
