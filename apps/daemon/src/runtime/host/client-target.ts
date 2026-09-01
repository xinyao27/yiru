export type RuntimeClientTarget = {
  id: number
  getType: () => string
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
  send: (channel: string, ...args: unknown[]) => void
}
