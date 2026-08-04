import {
  getSettingsFocusedExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { buildSidebarHostOptions } from '~renderer/components/sidebar/host-options'
import { isMacUserAgent } from '~renderer/components/terminal-pane/pane-helpers'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import { getHostDisplayLabelOverrides } from '~shared/host-setting-overrides'
import type { GlobalSettings } from '~shared/types'

import { matchesSettingsSearch } from '../search'
import { BrowserDefaultZoomSetting } from './default-zoom-setting'
import {
  createBrowserHomePageDraftState,
  resolveBrowserHomePageDraftState
} from './home-page-draft-state'
import { BrowserHomePageSetting } from './home-page-setting'
import { BrowserLinkRoutingSetting } from './link-routing-setting'
import { BrowserLocalhostWorktreeLabelsSetting } from './localhost-worktree-labels-setting'
import { BrowserNewProfileDialog } from './new-profile-dialog'
import { getBrowserPaneCombinedSearchEntries } from './pane-search'
import { getBrowserPaneSearchEntries, getBrowserLinkRoutingDescription } from './search'
import { BrowserSearchEngineSetting } from './search-engine-setting'
import { BrowserSessionCookiesSection } from './session-cookies-section'
import { BrowserUseSetup } from './use-pane'
import { getBrowserUsePaneSearchEntries } from './use-search'
export { getBrowserPaneCombinedSearchEntries }

type BrowserPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  onOpenComputerUse?: () => void
}

function cancelBrowserSessionCookieScrollFrames(frameIds: MutableRefObject<number[]>): void {
  for (const frameId of frameIds.current) {
    cancelAnimationFrame(frameId)
  }
  frameIds.current = []
}

export function BrowserPane({
  settings,
  updateSettings,
  onOpenComputerUse
}: BrowserPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const browserDefaultUrl = useAppStore((s) => s.browserDefaultUrl)
  const setBrowserDefaultUrl = useAppStore((s) => s.setBrowserDefaultUrl)
  const browserDefaultSearchEngine = useAppStore((s) => s.browserDefaultSearchEngine)
  const setBrowserDefaultSearchEngine = useAppStore((s) => s.setBrowserDefaultSearchEngine)
  const browserDefaultZoomLevel = useAppStore((s) => s.browserDefaultZoomLevel)
  const setBrowserDefaultZoomLevel = useAppStore((s) => s.setBrowserDefaultZoomLevel)
  const browserSessionProfiles = useAppStore((s) => s.browserSessionProfiles)
  const repos = useAppStore((s) => s.repos)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const switchRuntimeEnvironment = useAppStore((s) => s.switchRuntimeEnvironment)
  const detectedBrowsers = useAppStore((s) => s.detectedBrowsers)
  const browserSessionImportState = useAppStore((s) => s.browserSessionImportState)
  const defaultBrowserSessionProfileId = useAppStore((s) => s.defaultBrowserSessionProfileId)
  const setDefaultBrowserSessionProfileId = useAppStore((s) => s.setDefaultBrowserSessionProfileId)
  const defaultProfile = browserSessionProfiles.find((p) => p.id === 'default')
  const nonDefaultProfiles = browserSessionProfiles.filter((p) => p.scope !== 'default')
  const persistedHomePageDraft = browserDefaultUrl ?? ''
  const [homePageDraftState, setHomePageDraftState] = useState(() =>
    createBrowserHomePageDraftState(persistedHomePageDraft)
  )
  const [newProfileDialogOpen, setNewProfileDialogOpen] = useState(false)
  const sessionCookieScrollFrameIdsRef = useRef<number[]>([])
  const resolvedHomePageDraftState = resolveBrowserHomePageDraftState(
    homePageDraftState,
    persistedHomePageDraft
  )

  if (resolvedHomePageDraftState !== homePageDraftState) {
    setHomePageDraftState(resolvedHomePageDraftState)
  }
  const homePageDraft = resolvedHomePageDraftState.value
  const setHomePageDraft = (value: string): void => {
    setHomePageDraftState((current) => ({ ...current, value }))
  }

  const setBrowserPaneRootNode = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      return
    }
    cancelBrowserSessionCookieScrollFrames(sessionCookieScrollFrameIdsRef)
  }, [])

  const selectedSearchEngine = browserDefaultSearchEngine ?? 'google'

  const showHomePage = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[0]])
  const showSearchEngine = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[1]])
  const showDefaultZoom = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[2]])
  const showLinkRouting = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[3]])
  const showLocalhostLabels = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[4]])
  const showCookies = matchesSettingsSearch(searchQuery, [getBrowserPaneSearchEntries()[5]])
  const showBrowserUse = matchesSettingsSearch(searchQuery, getBrowserUsePaneSearchEntries())
  const isMac = isMacUserAgent()
  const linkRoutingDescription = getBrowserLinkRoutingDescription({ isMac })
  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  const browserSessionHostOptions = useMemo(
    () =>
      buildSidebarHostOptions({
        repos,
        settings,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides
      })
        .filter((host) => host.kind === 'local' || host.kind === 'runtime')
        .map((host) => ({
          id: host.id,
          label: host.label,
          detail:
            host.kind === 'local'
              ? translate('auto.components.settings.BrowserPane.86b7c83fee', 'This computer')
              : translate(
                  'auto.components.settings.BrowserPane.c0f85056d9',
                  'Browser profiles on this Yiru server.'
                )
        })),
    [repos, settings, runtimeEnvironments, runtimeStatusByEnvironmentId, hostLabelOverrides]
  )
  const selectedBrowserSessionHostId = getSettingsFocusedExecutionHostId(settings)
  const selectBrowserSessionHost = useCallback(
    (hostId: ExecutionHostId) => {
      const parsed = parseExecutionHostId(hostId)
      if (parsed?.kind === 'runtime') {
        void switchRuntimeEnvironment(parsed.environmentId)
        return
      }
      if (parsed?.kind === 'local') {
        void switchRuntimeEnvironment(null)
      }
    },
    [switchRuntimeEnvironment]
  )

  const requestSessionCookieScrollFrame = (callback: FrameRequestCallback): void => {
    let completed = false
    let frameId: number | undefined
    frameId = requestAnimationFrame((timestamp) => {
      completed = true
      if (frameId !== undefined) {
        sessionCookieScrollFrameIdsRef.current = sessionCookieScrollFrameIdsRef.current.filter(
          (pendingFrameId) => pendingFrameId !== frameId
        )
      }
      callback(timestamp)
    })
    if (!completed) {
      sessionCookieScrollFrameIdsRef.current.push(frameId)
    }
  }

  const scrollToSessionCookies = (): void => {
    cancelBrowserSessionCookieScrollFrames(sessionCookieScrollFrameIdsRef)
    useAppStore.getState().setSettingsSearchQuery('')
    requestSessionCookieScrollFrame(() => {
      requestSessionCookieScrollFrame(() => {
        const el = document.getElementById('browser-session-cookies')
        if (!el) {
          return
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  return (
    <div ref={setBrowserPaneRootNode} className="space-y-6">
      {showBrowserUse ? (
        <BrowserUseSetup
          onConfigureMoreBrowsers={scrollToSessionCookies}
          onOpenComputerUse={onOpenComputerUse}
        />
      ) : null}

      {showHomePage ? (
        <BrowserHomePageSetting
          value={homePageDraft}
          onChange={setHomePageDraft}
          onSave={(url) => {
            setBrowserDefaultUrl(url)
            setHomePageDraftState(createBrowserHomePageDraftState(url ?? ''))
          }}
        />
      ) : null}

      {showSearchEngine ? (
        <BrowserSearchEngineSetting
          selectedSearchEngine={selectedSearchEngine}
          onSearchEngineChange={(engine) => {
            setBrowserDefaultSearchEngine(engine === 'google' ? null : engine)
          }}
        />
      ) : null}

      {showDefaultZoom ? (
        <BrowserDefaultZoomSetting
          value={browserDefaultZoomLevel}
          onChange={setBrowserDefaultZoomLevel}
        />
      ) : null}

      {showLinkRouting ? (
        <BrowserLinkRoutingSetting
          settings={settings}
          linkRoutingDescription={linkRoutingDescription}
          isMac={isMac}
          updateSettings={updateSettings}
        />
      ) : null}

      {showLocalhostLabels ? (
        <BrowserLocalhostWorktreeLabelsSetting
          settings={settings}
          updateSettings={updateSettings}
        />
      ) : null}

      {showCookies ? (
        <BrowserSessionCookiesSection
          defaultProfile={defaultProfile}
          nonDefaultProfiles={nonDefaultProfiles}
          detectedBrowsers={detectedBrowsers}
          importState={browserSessionImportState}
          defaultBrowserSessionProfileId={defaultBrowserSessionProfileId}
          hostOptions={browserSessionHostOptions}
          selectedHostId={selectedBrowserSessionHostId}
          onAddProfile={() => setNewProfileDialogOpen(true)}
          onSelectHost={selectBrowserSessionHost}
          onSelectDefaultProfile={() => setDefaultBrowserSessionProfileId(null)}
          onSelectProfile={setDefaultBrowserSessionProfileId}
        />
      ) : null}

      <BrowserNewProfileDialog open={newProfileDialogOpen} onOpenChange={setNewProfileDialogOpen} />
    </div>
  )
}
