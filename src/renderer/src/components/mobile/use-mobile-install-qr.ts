import { useEffect, useState } from 'react'
import QRCodeBrowser from 'qrcode/lib/browser'
import { getMobileReleaseLink, type MobilePlatform } from './mobile-release-link'
import type { MobilePageStage } from './mobile-page-stage'

async function renderQrDataUrl(text: string): Promise<string> {
  return QRCodeBrowser.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 232
  })
}

export function useMobileInstallQr(
  stage: MobilePageStage | null,
  platform: MobilePlatform
): string | null {
  const [installQrUrl, setInstallQrUrl] = useState<string | null>(null)

  // Why: render install QRs lazily and clear the old platform's QR while the
  // replacement is generated so users cannot scan a stale destination.
  useEffect(() => {
    if (stage !== 'flow') {
      return
    }
    setInstallQrUrl(null)
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = await renderQrDataUrl(getMobileReleaseLink(platform).url)
        if (!cancelled) {
          setInstallQrUrl(dataUrl)
        }
      } catch {
        if (!cancelled) {
          setInstallQrUrl(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [platform, stage])

  return installQrUrl
}
