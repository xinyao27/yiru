export type RuntimeRendererTarget = {
  id: number
  getType: () => string
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
  send: (channel: string, ...args: unknown[]) => void
}

export type RuntimeWindowTarget = {
  isDestroyed: () => boolean
  once: (event: 'closed', listener: () => void) => unknown
  webContents: RuntimeRendererTarget
}
