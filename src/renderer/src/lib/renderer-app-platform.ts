export function getRendererAppPlatform(): NodeJS.Platform {
  const e2ePlatform =
    typeof window === 'undefined'
      ? undefined
      : window.api?.e2e?.getConfig?.().rendererPlatformOverride
  if (e2ePlatform) {
    // Why: visual platform branches need coverage on a single-host CI runner
    // without changing production platform detection.
    return e2ePlatform
  }
  const preloadPlatform =
    typeof window === 'undefined' ? undefined : window.api?.platform?.get?.()?.platform
  if (preloadPlatform) {
    return preloadPlatform
  }
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (userAgent.includes('Windows')) {
    return 'win32'
  }
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  if (userAgent) {
    return 'linux'
  }
  return 'win32'
}
