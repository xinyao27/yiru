type SystemMediaAccessKind = 'camera' | 'microphone'

export type BrowserMediaAccessProvider = {
  hasAccess: (mediaType: SystemMediaAccessKind) => boolean
  requestAccess: (mediaType: SystemMediaAccessKind) => Promise<boolean>
}

// Why: a pure Node host cannot drive macOS TCC itself. Browser backends must
// install a host provider; until then Darwin fails closed instead of claiming
// that a guest received camera or microphone access.
let mediaAccessProvider: BrowserMediaAccessProvider = {
  hasAccess: () => false,
  requestAccess: () => Promise.resolve(false)
}

export function setBrowserMediaAccessProvider(provider: BrowserMediaAccessProvider): void {
  mediaAccessProvider = provider
}

// Why: macOS gates all camera/microphone access at the app-process level via
// TCC. Electron's per-session permission handlers run inside that envelope:
// if we call callback(true) but macOS has not granted the parent app, the
// stream is still empty. Conversely, if we deny at the session handler, pages
// never see the stream even when macOS has granted — which is the bug the user
// hit inside the in-app browser (#1273 only fixed Settings → Permissions, not
// the actual runtime getUserMedia() path).
//
// These helpers let both the main window session and the browser-tab sessions
// consult the same macOS-aware logic, so once a user has granted Camera or
// Microphone to Yiru (via Settings → Permissions or directly in System
// Settings), a page inside an in-app browser tab actually receives the stream.

export function requestedMediaTypes(details: unknown): Set<'audio' | 'video'> {
  if (!details || typeof details !== 'object' || !('mediaTypes' in details)) {
    return new Set()
  }
  const mediaTypes = details.mediaTypes
  if (!Array.isArray(mediaTypes)) {
    return new Set()
  }
  return new Set(mediaTypes.filter((mediaType) => mediaType === 'audio' || mediaType === 'video'))
}

export function hasSystemMediaAccess(mediaType: string | undefined): boolean {
  if (process.platform !== 'darwin') {
    return true
  }
  if (mediaType === 'audio') {
    return mediaAccessProvider.hasAccess('microphone')
  }
  if (mediaType === 'video') {
    return mediaAccessProvider.hasAccess('camera')
  }
  return false
}

export async function requestSystemMediaAccess(details: unknown): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true
  }

  const mediaTypes = requestedMediaTypes(details)
  if (mediaTypes.size === 0) {
    return false
  }

  if (mediaTypes.has('audio')) {
    // Why: macOS only shows the TCC prompt from the app process, so Chromium's
    // media grant is paired with the OS-level request at the actual media ask.
    const granted = await mediaAccessProvider.requestAccess('microphone')
    if (!granted) {
      return false
    }
  }
  if (mediaTypes.has('video')) {
    const granted = await mediaAccessProvider.requestAccess('camera')
    if (!granted) {
      return false
    }
  }
  return true
}
