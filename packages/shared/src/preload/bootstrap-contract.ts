export type RuntimeLoopbackCredentials = {
  endpoint: string
  processToken: Uint8Array<ArrayBuffer>
}

export type RuntimeRenderingHostBootstrap = {
  platform: NodeJS.Platform
  osRelease: string
  displayServer: 'wayland' | 'x11' | null
}

export type RuntimeConnectionBootstrap = {
  renderingHost: RuntimeRenderingHostBootstrap
  getCredentials: () => Promise<RuntimeLoopbackCredentials>
}
