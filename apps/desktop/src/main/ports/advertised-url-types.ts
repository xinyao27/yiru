export type HostKind = 'custom' | 'loopback' | 'private-ip' | 'public-ip'

export type AdvertisedUrl = {
  origin: string
  host: string
  hostKind: HostKind
  protocol: 'http' | 'https'
  port: number
  ptyId: string
  lastSeenAt: number
  validatedListenerPid?: number
}

export type AdvertisedUrlChangeEvent = {
  worktreeId: string
  port: number
}

export type AdvertisedUrlListenerObservation = {
  port: number
  pid?: number
}

export type ListenerScanState = { kind: 'absent' } | { kind: 'present'; pid?: number }
