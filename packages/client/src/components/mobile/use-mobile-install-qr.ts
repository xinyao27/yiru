import QRCodeBrowser from 'qrcode'
import { useEffect, useState } from 'react'

import type { MobilePageStage } from './page-stage'
import { getMobileReleaseLink, type MobilePlatform } from './release-link'

async function renderQrDataUrl(text: string): Promise<string> {
  return QRCodeBrowser.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 232
  })
}

type InstallQrResult = { stage: MobilePageStage; platform: MobilePlatform; dataUrl: string }

export function useMobileInstallQr(
  stage: MobilePageStage | null,
  platform: MobilePlatform
): string | null {
  const [result, setResult] = useState<InstallQrResult | null>(null)

  // Why: render install QRs lazily. The result is tagged with the (stage, platform)
  // it was generated for; the return expression below derives null whenever that tag
  // doesn't match the current pair, so a stale platform's QR can never render while
  // the replacement is still generating.
  useEffect(() => {
    if (stage !== 'flow') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = await renderQrDataUrl(getMobileReleaseLink(platform).url)
        if (!cancelled) {
          setResult({ stage, platform, dataUrl })
        }
      } catch {
        // Why: leave `result` untouched — the derivation below already renders null
        // for this (stage, platform) until a successful generation lands.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [platform, stage])

  return result && result.stage === stage && result.platform === platform ? result.dataUrl : null
}
