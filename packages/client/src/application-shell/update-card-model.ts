import { YIRU_GITHUB_RELEASES_URL } from '@yiru/runtime-protocol/model/product'

export type UpdateErrorCardModel = {
  variant?: 'default' | 'http1Compatibility'
  title: string
  summary: string
  message: string
  releaseUrl: string
  primaryAction?: {
    label: string
    pendingLabel?: string
    isPending?: boolean
    onClick: () => void
  }
}

export function updateReleaseUrl(version: string | null): string {
  // Why: when no version is cached, the releases listing remains available
  // even when GitHub's /latest API path is degraded.
  return version ? `${YIRU_GITHUB_RELEASES_URL}/tag/v${version}` : YIRU_GITHUB_RELEASES_URL
}

export function isAnimatedUpdateMedia(url: string | undefined): boolean {
  return typeof url === 'string' && url.toLowerCase().endsWith('.gif')
}

export function isHttp2ProtocolError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('err_http2_protocol_error') ||
    normalized.includes('http2_protocol_error') ||
    (normalized.includes('http/2') && normalized.includes('protocol'))
  )
}
