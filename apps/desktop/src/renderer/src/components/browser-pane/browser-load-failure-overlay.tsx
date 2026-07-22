import {
  Copy,
  Globe,
  ShieldWarning as ShieldAlert,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import { isEligibleLocalCertificateHost } from '../../../../shared/browser-url'
import type {
  BrowserCertificateFailure,
  BrowserCertificateProceedFailureReason,
  BrowserCertificateProceedResult,
  BrowserLoadError
} from '../../../../shared/types'
import {
  formatLoadFailureDescription,
  formatLoadFailureRecoveryHint,
  isCertificateLoadError,
  type LoadFailureMeta
} from './browser-notices'

type BrowserLoadFailureOverlayProps = {
  loadError: BrowserLoadError
  externalUrl?: string | null
  currentUrl: string
  httpsRecoveryUrl: string | null
  onRetry: () => void
  onTryHttps: (url: string) => void
  onCopy: (url: string) => void
  onOpenExternal?: (url: string) => void
  certificateFailure?: BrowserCertificateFailure | null
  expectedBrowserPageId?: string | null
  onProceedCertificate?: (challengeId: string) => Promise<BrowserCertificateProceedResult>
}

type CertificateProceedAttempt = {
  challengeId: string
  state: 'submitting' | 'failed'
  showConnecting: boolean
  reason?: BrowserCertificateProceedFailureReason | 'request-failed'
}

function getLoadErrorMetadata(loadError: BrowserLoadError): LoadFailureMeta {
  try {
    const parsed = new URL(loadError.validatedUrl)
    return {
      host: parsed.host || null,
      isLocalhostLike:
        parsed.hostname === '0.0.0.0' || isEligibleLocalCertificateHost(parsed.hostname)
    }
  } catch {
    return { host: null, isLocalhostLike: false }
  }
}

function normalizeCertificateError(error: string): string {
  return error
    .trim()
    .replace(/^net::/i, '')
    .toUpperCase()
}

function getMatchingCertificateFailure(args: {
  loadError: BrowserLoadError
  certificateFailure?: BrowserCertificateFailure | null
  expectedBrowserPageId?: string | null
  canProceed: boolean
}): BrowserCertificateFailure | null {
  const { loadError, certificateFailure, expectedBrowserPageId, canProceed } = args
  const errorMatchesChallenge = Boolean(
    certificateFailure &&
    (loadError.code === -1 ||
      (loadError.code === certificateFailure.errorCode &&
        normalizeCertificateError(certificateFailure.error) ===
          normalizeCertificateError(loadError.description)))
  )
  if (
    !canProceed ||
    !certificateFailure?.canProceed ||
    !expectedBrowserPageId ||
    certificateFailure.browserPageId !== expectedBrowserPageId ||
    certificateFailure.errorCode !== -202 ||
    !errorMatchesChallenge
  ) {
    return null
  }
  try {
    return new URL(loadError.validatedUrl).origin === certificateFailure.origin
      ? certificateFailure
      : null
  } catch {
    return null
  }
}

function formatCertificateProceedFailure(
  reason: BrowserCertificateProceedFailureReason | 'request-failed'
): string {
  if (reason === 'expired') {
    return translate(
      'browser.loadFailure.certificateChallengeExpired',
      'This certificate approval expired. Retry the page to request a new one.'
    )
  }
  if (reason === 'changed' || reason === 'navigated') {
    return translate(
      'browser.loadFailure.certificateChallengeChanged',
      'The certificate request changed. Retry the page and review the new warning.'
    )
  }
  if (reason === 'request-failed') {
    return translate(
      'browser.loadFailure.certificateProceedFailed',
      'Yiru could not approve this certificate request. Retry the page and try again.'
    )
  }
  return translate(
    'browser.loadFailure.certificateChallengeUnavailable',
    'This certificate request is no longer available. Retry the page to request a new one.'
  )
}

export function BrowserLoadFailureOverlay({
  loadError,
  externalUrl,
  currentUrl,
  httpsRecoveryUrl,
  onRetry,
  onTryHttps,
  onCopy,
  onOpenExternal,
  certificateFailure,
  expectedBrowserPageId,
  onProceedCertificate
}: BrowserLoadFailureOverlayProps): React.JSX.Element {
  const connectingTimerRef = useRef<{
    challengeId: string
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const [proceedAttempt, setProceedAttempt] = useState<CertificateProceedAttempt | null>(null)
  const matchingCertificateFailure = getMatchingCertificateFailure({
    loadError,
    certificateFailure,
    expectedBrowserPageId,
    canProceed: Boolean(onProceedCertificate)
  })
  // Why: Chromium's error-page fallback can replace the diagnostic code with
  // -1 after main has already captured an exact live certificate challenge.
  const presentationLoadError =
    matchingCertificateFailure && loadError.code === -1
      ? {
          ...loadError,
          code: matchingCertificateFailure.errorCode ?? loadError.code,
          description: matchingCertificateFailure.error
        }
      : loadError
  const meta = getLoadErrorMetadata(presentationLoadError)
  const certificateError = isCertificateLoadError(presentationLoadError)
  const recoveryHint = formatLoadFailureRecoveryHint(meta, presentationLoadError)
  const activeProceedAttempt =
    proceedAttempt?.challengeId === matchingCertificateFailure?.challengeId ? proceedAttempt : null
  const actionsDisabled = activeProceedAttempt?.state === 'submitting'

  useEffect(() => {
    return () => {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current.timer)
        connectingTimerRef.current = null
      }
    }
  }, [matchingCertificateFailure?.challengeId])

  const proceedCertificate = (): void => {
    if (!matchingCertificateFailure || !onProceedCertificate || actionsDisabled) {
      return
    }
    const challengeId = matchingCertificateFailure.challengeId
    setProceedAttempt({ challengeId, state: 'submitting', showConnecting: false })
    connectingTimerRef.current = {
      challengeId,
      timer: setTimeout(() => {
        setProceedAttempt((current) =>
          current?.challengeId === challengeId && current.state === 'submitting'
            ? { ...current, showConnecting: true }
            : current
        )
      }, 200)
    }
    void onProceedCertificate(challengeId)
      .then((result) => {
        if (connectingTimerRef.current?.challengeId === challengeId) {
          clearTimeout(connectingTimerRef.current.timer)
          connectingTimerRef.current = null
        }
        if (!result.ok) {
          setProceedAttempt((current) =>
            current?.challengeId === challengeId
              ? {
                  challengeId,
                  state: 'failed',
                  showConnecting: false,
                  reason: result.reason
                }
              : current
          )
        }
      })
      .catch(() => {
        if (connectingTimerRef.current?.challengeId === challengeId) {
          clearTimeout(connectingTimerRef.current.timer)
          connectingTimerRef.current = null
        }
        setProceedAttempt((current) =>
          current?.challengeId === challengeId
            ? {
                challengeId,
                state: 'failed',
                showConnecting: false,
                reason: 'request-failed'
              }
            : current
        )
      })
  }
  const retryButton = (
    <Button
      size="sm"
      variant={certificateError && !externalUrl ? 'default' : 'outline'}
      className="h-9 gap-2 px-3"
      disabled={actionsDisabled}
      onClick={onRetry}
    >
      <RefreshCw className="size-4" />
      {translate('browser.loadFailure.retry', 'Retry')}
    </Button>
  )
  const copyButton = (
    <Button
      size="sm"
      variant="ghost"
      className="h-9 gap-2 px-3"
      disabled={actionsDisabled}
      onClick={() => onCopy(currentUrl)}
    >
      <Copy className="size-4" />
      {translate('browser.loadFailure.copyAddress', 'Copy Address')}
    </Button>
  )
  const externalButton =
    externalUrl && onOpenExternal ? (
      <Button
        size="sm"
        variant={certificateError ? 'default' : 'ghost'}
        className="h-9 gap-2 px-3"
        disabled={actionsDisabled}
        onClick={() => onOpenExternal(externalUrl)}
      >
        <ExternalLink className="size-4" />
        {translate('browser.loadFailure.openExternally', 'Open Externally')}
      </Button>
    ) : null

  return (
    <div className="bg-background absolute inset-0 z-20 flex items-center justify-center px-6">
      <div aria-live="polite" className="flex max-w-lg flex-col items-center px-8 py-8 text-center">
        <div className="border-border bg-muted text-muted-foreground mb-4 rounded-full border p-3">
          {certificateError ? <ShieldAlert className="size-5" /> : <Globe className="size-5" />}
        </div>
        <h2 className="text-foreground text-base font-semibold">
          {certificateError
            ? translate('browser.loadFailure.connectionNotSecure', "Connection isn't secure")
            : meta.host
              ? translate('browser.loadFailure.cantReachHost', "Can't reach {{value0}}", {
                  value0: meta.host
                })
              : translate('browser.loadFailure.cantLoadPage', "Can't load this page")}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {formatLoadFailureDescription(presentationLoadError, meta)}
        </p>
        {certificateError && meta.isLocalhostLike ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {translate(
              'browser.loadFailure.trustedCertificateGuidance',
              'For local development, use a trusted local certificate when possible.'
            )}
          </p>
        ) : null}
        {recoveryHint ? <p className="text-muted-foreground mt-2 text-xs">{recoveryHint}</p> : null}
        {activeProceedAttempt?.state === 'failed' && activeProceedAttempt.reason ? (
          <p role="alert" className="text-destructive mt-3 text-xs">
            {formatCertificateProceedFailure(activeProceedAttempt.reason)}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {certificateError ? (
            <>
              {externalButton}
              {retryButton}
              {copyButton}
              {matchingCertificateFailure ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-48 gap-2 px-3"
                  disabled={actionsDisabled}
                  onClick={proceedCertificate}
                >
                  {activeProceedAttempt?.state === 'submitting' &&
                  activeProceedAttempt.showConnecting ? (
                    <>
                      <LoadingIndicator className="size-4" />
                      {translate('browser.loadFailure.connecting', 'Connecting…')}
                    </>
                  ) : (
                    translate('browser.loadFailure.proceedUnsafe', 'Proceed Anyway (Unsafe)')
                  )}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {httpsRecoveryUrl ? (
                <Button
                  size="sm"
                  className="h-9 gap-2 px-3"
                  disabled={actionsDisabled}
                  onClick={() => onTryHttps(httpsRecoveryUrl)}
                >
                  {translate('browser.loadFailure.tryHttps', 'Try HTTPS')}
                </Button>
              ) : null}
              {retryButton}
              {copyButton}
              {externalButton}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
