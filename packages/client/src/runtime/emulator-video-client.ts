type EmulatorVideoClient = Partial<
  Pick<
    Window['api']['emulator'],
    'onVideoStreamFrame' | 'onVideoStreamMeta' | 'startVideoStream' | 'stopVideoStream'
  >
>

// Why: emulator H.264 frames stay on their dedicated binary preload channel;
// feature code still goes through this renderer transport boundary so web can
// expose the capability as unavailable without depending on Electron's API.
export function getEmulatorVideoClient(): EmulatorVideoClient | null {
  if (typeof window === 'undefined') {
    return null
  }
  return (window as Window & { api?: Window['api'] }).api?.emulator ?? null
}
