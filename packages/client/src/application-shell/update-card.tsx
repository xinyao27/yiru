import type { UpdateStatus } from '@yiru/runtime-protocol/workbench/types'
import { useEffect, useRef, useState, type JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { usePrefersReducedMotion } from '~renderer/react/use-prefers-reduced-motion'
import { updateRendererSettings } from '~renderer/runtime/settings-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { cn } from '~renderer/ui/class-names'

import { useAppStore } from '../store/state'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { UpdateCardBody } from './update-card-body'
import {
  isHttp2ProtocolError,
  updateReleaseUrl,
  type UpdateErrorCardModel
} from './update-card-model'
import { useUpdateCardMotion } from './use-update-card-motion'

export { isHttp2ProtocolError } from './update-card-model'

export function UpdateCard(): JSX.Element | null {
  const status = useAppStore((state) => state.updateStatus)
  const changelog = useAppStore((state) => state.updateChangelog)
  const userInitiatedCycle = useAppStore((state) => state.updateUserInitiatedCycle)
  const dismissedVersion = useAppStore((state) => state.dismissedUpdateVersion)
  const dismissUpdate = useAppStore((state) => state.dismissUpdate)
  const collapsed = useAppStore((state) => state.updateCardCollapsed)
  const setCollapsed = useAppStore((state) => state.setUpdateCardCollapsed)
  const reassuranceSeen = useAppStore((state) => state.updateReassuranceSeen)
  const markReassuranceSeen = useAppStore((state) => state.markUpdateReassuranceSeen)
  const prefersReducedMotion = usePrefersReducedMotion()
  const downloadOrigin = useRef<{ version: string | null; started: boolean }>({
    version: null,
    started: false
  })
  const [mediaState, setMediaState] = useState<{
    version: string | null
    failed: boolean
    loaded: boolean
  }>({ version: null, failed: false, loaded: false })
  const [installFailure, setInstallFailure] = useState<{
    version: string | null
    message: string
  } | null>(null)
  const [compatibilityState, setCompatibilityState] = useState<{
    errorKey: string | null
    relaunching: boolean
    setupError: string | null
  }>({ errorKey: null, relaunching: false, setupError: null })
  const [errorDismissedStatus, setErrorDismissedStatus] = useState<UpdateStatus | null>(null)
  const [autoDismissedStatus, setAutoDismissedStatus] = useState<UpdateStatus | null>(null)

  // Why: errors omit the version even when they belong to an active update.
  // Cache it for dismiss persistence and the manual release fallback.
  const versionRef = useRef<string | null>(null)
  const statusVersion = 'version' in status ? status.version : null
  const cachedVersion = statusVersion ?? versionRef.current
  useEffect(() => {
    if (statusVersion) {
      versionRef.current = statusVersion
    } else if (
      status.state === 'checking' ||
      status.state === 'idle' ||
      status.state === 'not-available'
    ) {
      versionRef.current = null
    }
  }, [status.state, statusVersion])

  const mediaFailed = mediaState.version === cachedVersion && mediaState.failed
  const mediaLoaded = mediaState.version === cachedVersion && mediaState.loaded
  const installError = installFailure?.version === cachedVersion ? installFailure.message : null
  const compatibilityErrorKey = status.state === 'error' ? status.message : null
  const compatibilityRelaunching =
    compatibilityState.errorKey === compatibilityErrorKey && compatibilityState.relaunching
  const compatibilitySetupError =
    compatibilityState.errorKey === compatibilityErrorKey ? compatibilityState.setupError : null
  const autoDismissed = autoDismissedStatus === status
  const errorDismissed = errorDismissedStatus === status

  const shouldAutoDismissLatest =
    status.state === 'not-available' && 'userInitiated' in status && Boolean(status.userInitiated)
  useEffect(() => {
    if (!shouldAutoDismissLatest) {
      return
    }
    const timer = setTimeout(() => setAutoDismissedStatus(status), 3000)
    return () => clearTimeout(timer)
  }, [shouldAutoDismissLatest, status])

  // Why: StrictMode can render twice, so restart remains an effect guarded by
  // the download action that originated from this card.
  useEffect(() => {
    const startedThisVersion =
      status.state === 'downloaded' &&
      statusVersion !== null &&
      downloadOrigin.current.started &&
      downloadOrigin.current.version === statusVersion
    if (startedThisVersion) {
      void shellClient.updater.quitAndInstall().catch((error) => {
        setInstallFailure({
          version: statusVersion,
          message: String((error as Error)?.message ?? error)
        })
      })
    }
  }, [status.state, statusVersion])

  const startedDownload =
    downloadOrigin.current.started && downloadOrigin.current.version === cachedVersion
  const handleUpdate = (): void => {
    downloadOrigin.current = { version: cachedVersion, started: true }
    if (!reassuranceSeen) {
      markReassuranceSeen()
    }
    void shellClient.updater.download()
  }
  const handleClose = (): void => {
    if (status.state === 'error') {
      setErrorDismissedStatus(status)
      if (cachedVersion) {
        dismissUpdate(cachedVersion)
      }
      return
    }
    dismissUpdate()
  }
  const handleInstallRetry = (): void => {
    void shellClient.updater.quitAndInstall().catch((error) => {
      setInstallFailure({
        version: cachedVersion,
        message: String((error as Error)?.message ?? error)
      })
    })
  }
  const handleEnableHttp1Compatibility = (): void => {
    setCompatibilityState({
      errorKey: compatibilityErrorKey,
      relaunching: true,
      setupError: null
    })
    void updateRendererSettings({ electronHttp1CompatibilityMode: true })
      .then(() => shellClient.app.relaunch())
      .catch((error) => {
        const message = String((error as Error)?.message ?? error)
        console.error('[updates] failed to enable HTTP/1.1 compatibility:', error)
        setCompatibilityState({
          errorKey: compatibilityErrorKey,
          relaunching: false,
          setupError: `Could not enable compatibility mode. ${message}`
        })
      })
  }

  const errorCard = createErrorCard({
    status,
    cachedVersion,
    installError,
    compatibilityRelaunching,
    compatibilitySetupError,
    onEnableCompatibility: handleEnableHttp1Compatibility,
    onUpdate: handleUpdate,
    onInstallRetry: handleInstallRetry
  })
  const motion = useUpdateCardMotion({
    statusState: status.state,
    prefersReducedMotion,
    onDismiss: handleClose,
    onCollapse: () => setCollapsed(true)
  })

  const isUserInitiated = 'userInitiated' in status && status.userInitiated
  const shouldShowDetailedError =
    status.state === 'error' && (startedDownload || cachedVersion !== null)
  if (status.state === 'checking' && !isUserInitiated) {
    return null
  }
  if (status.state === 'not-available' && (!isUserInitiated || autoDismissed)) {
    return null
  }
  if (status.state === 'idle') {
    return null
  }
  if (status.state === 'error' && !shouldShowDetailedError && !isUserInitiated) {
    return null
  }
  if (status.state === 'error' && errorDismissed) {
    return null
  }
  if (cachedVersion && dismissedVersion === cachedVersion && !userInitiatedCycle) {
    if (status.state !== 'downloading' && status.state !== 'error') {
      return null
    }
  }
  if (
    collapsed &&
    (status.state === 'downloading' || status.state === 'downloaded' || status.state === 'error')
  ) {
    return null
  }

  const ariaLabel = updateCardAriaLabel(status.state)
  const animationClass = prefersReducedMotion
    ? ''
    : motion.exiting
      ? 'animate-[update-card-exit_150ms_ease-in_both]'
      : 'animate-[update-card-enter_200ms_ease-out_both]'
  const showReassurance =
    !reassuranceSeen && (status.state === 'available' || status.state === 'downloading')

  return (
    <div
      ref={motion.cardRootRef}
      className="fixed right-4 bottom-10 z-40 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 max-[480px]:right-4 max-[480px]:left-4 max-[480px]:w-auto"
    >
      {showReassurance ? (
        <Card className={cn('py-0 gap-0', animationClass)}>
          <div className="flex items-center gap-3 p-3">
            <p className="text-muted-foreground min-w-0 flex-1 text-xs">
              {translate(
                'auto.components.UpdateCard.b1d867f4fb',
                "Your terminal sessions won't be interrupted during the update."
              )}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={markReassuranceSeen}
              aria-label={translate('auto.components.UpdateCard.7274ef6e59', 'Dismiss tip')}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </Card>
      ) : null}
      <Card
        role="complementary"
        aria-label={ariaLabel}
        aria-live="polite"
        tabIndex={-1}
        onKeyDown={motion.handleKeyDown}
        className={cn('py-0 gap-0', animationClass)}
      >
        <UpdateCardBody
          status={status}
          changelog={changelog}
          errorCard={errorCard}
          startedDownload={startedDownload}
          prefersReducedMotion={prefersReducedMotion}
          mediaFailed={mediaFailed}
          mediaLoaded={mediaLoaded}
          onMediaError={() =>
            setMediaState({ version: cachedVersion, failed: true, loaded: false })
          }
          onMediaLoad={() => setMediaState({ version: cachedVersion, failed: false, loaded: true })}
          onUpdate={handleUpdate}
          onInstallRetry={handleInstallRetry}
          onDismiss={motion.dismissWithAnimation}
          onCollapse={motion.collapseWithAnimation}
        />
      </Card>
    </div>
  )
}

function createErrorCard(options: {
  status: ReturnType<typeof useAppStore.getState>['updateStatus']
  cachedVersion: string | null
  installError: string | null
  compatibilityRelaunching: boolean
  compatibilitySetupError: string | null
  onEnableCompatibility: () => void
  onUpdate: () => void
  onInstallRetry: () => void
}): UpdateErrorCardModel | null {
  if (options.status.state === 'error') {
    if (isHttp2ProtocolError(options.status.message)) {
      return {
        variant: 'http1Compatibility',
        title: translate('auto.components.UpdateCard.1339b82cee', 'HTTP/2 Download Blocked'),
        summary: 'Yiru can retry through HTTP/1.1 compatibility mode.',
        message: options.compatibilitySetupError ?? options.status.message,
        releaseUrl: updateReleaseUrl(options.cachedVersion),
        primaryAction: {
          label: translate('auto.components.UpdateCard.933c6fdf5b', 'Enable & Restart'),
          pendingLabel: 'Restarting...',
          isPending: options.compatibilityRelaunching,
          onClick: options.onEnableCompatibility
        }
      }
    }
    return {
      title: options.cachedVersion ? 'Update Error' : 'Update Check Failed',
      summary: options.cachedVersion
        ? 'Could not complete the update.'
        : 'Could not check for updates.',
      message: options.status.message,
      releaseUrl: updateReleaseUrl(options.cachedVersion),
      primaryAction: options.cachedVersion
        ? {
            label: translate('auto.components.UpdateCard.48565a32bc', 'Retry Download'),
            onClick: options.onUpdate
          }
        : {
            label: translate('auto.components.UpdateCard.6b0085010d', 'Re-check'),
            onClick: () => void shellClient.updater.check({ includePrerelease: false })
          }
    }
  }
  if (!options.installError) {
    return null
  }
  return {
    title: translate('auto.components.UpdateCard.4cf109845a', 'Update Error'),
    summary: 'Could not restart to install the update.',
    message: options.installError,
    releaseUrl: updateReleaseUrl(options.cachedVersion),
    primaryAction: {
      label: translate('auto.components.UpdateCard.2c2d3e03ca', 'Try Again'),
      onClick: options.onInstallRetry
    }
  }
}

function updateCardAriaLabel(
  state: ReturnType<typeof useAppStore.getState>['updateStatus']['state']
): string {
  if (state === 'checking') {
    return 'Checking for updates'
  }
  if (state === 'not-available') {
    return "You're on the latest version"
  }
  if (state === 'available') {
    return 'Update available'
  }
  if (state === 'downloading') {
    return 'Downloading update'
  }
  if (state === 'downloaded') {
    return 'Update ready to install'
  }
  if (state === 'error') {
    return 'Update error'
  }
  return 'Update status'
}
