export function getChromeVersion(): string | undefined {
  const version = navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1]
  return version || undefined
}
