export type RuntimeLoopbackCredentials = {
  endpoint: string
  processToken: Uint8Array<ArrayBuffer>
}

export type RuntimeConnectionBootstrap = {
  getCredentials: () => Promise<RuntimeLoopbackCredentials>
}
