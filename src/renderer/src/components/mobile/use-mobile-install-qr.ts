import { useEffect, useState } from 'react'
import QRCodeBrowser from 'qrcode/lib/browser'
import { getMobileReleaseLink } from './mobile-release-link'
import type { MobilePageStage } from './mobile-page-stage'

async function renderQrDataUrl(text: string): Promise<string> {
  return QRCodeBrowser.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 232
  })
}

export function useMobileInstallQr(stage: MobilePageStage | null): string | null {
  const [installQrUrl, setInstallQrUrl] = useState<string | null>(null)

  // Why: render the external release QR only after the user enters the flow.
  useEffect(() => {
    if (stage !== 'flow') {
      return
    }
    setInstallQrUrl(null)
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = await renderQrDataUrl(getMobileReleaseLink().url)
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
  }, [stage])

  return installQrUrl
}
