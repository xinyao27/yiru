import type { MobileTerminalSideEffectBatch } from './side-effects'

export type MobileTerminalDeliveryState = {
  visible: boolean
  interested: boolean
  priority: 'parked' | 'visible' | 'active'
}

export type MobileTerminalSnapshotMetadata = {
  cwd: string | null
  lastTitle: string | null
  oscLinks: { uri: string; start: number; end: number }[]
  kittyKeyboardFlags: number
  displayMode: 'auto' | 'desktop'
  requestedScrollbackRows: number
}

export type MobileTerminalSnapshot = {
  id: number
  cols: number
  rows: number
  activeBuffer: 'normal' | 'alternate'
  normalScrollback: string
  normalScreen: string
  alternateScreen: string
  pendingEscapeTail: string
  coverageEndSeq: string
  pendingDeliveryStartSeq: string
  wireByteLength: number
  retainedScrollbackRows: number
  truncated: boolean
  source: 'headless' | 'provider'
  metadata: MobileTerminalSnapshotMetadata
}

export type MobileTerminalCallbacks = {
  onData: (
    data: string,
    meta: { endSeq: string; wireByteLength: number; ackEveryBytes: number }
  ) => void
  onSnapshot: (snapshot: MobileTerminalSnapshot) => void
  onSubscribed?: () => void
  onEnd?: () => void
  onError?: (message: string) => void
  onFitOverrideChanged?: (event: {
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
    cols: number
    rows: number
  }) => void
  onDriverChanged?: (
    driver: { kind: 'idle' } | { kind: 'desktop' } | { kind: 'mobile'; clientId: string }
  ) => void
  onMetadata?: (metadata: Record<string, unknown>) => void
  onSideEffectBatch?: (batch: MobileTerminalSideEffectBatch) => void
  onClearBuffer?: () => void
  onTransportClose?: () => void
}

export type MobileMultiplexedTerminal = {
  streamId: number
  sendInput: (text: string) => boolean
  sendInputAccepted: (text: string) => Promise<boolean>
  sendQueryReply: (text: string) => boolean
  resize: (cols: number, rows: number) => boolean
  claimViewport: (cols: number, rows: number) => boolean
  setDeliveryState: (state: MobileTerminalDeliveryState) => boolean
  outputParsed: (endSeq: string, receiverQueueBytes?: number) => void
  snapshotParsed: (snapshotId: number) => void
  close: () => void
}

export type MobileTerminalSubscribeArgs = {
  terminal: string
  client: { id: string; type: 'mobile' }
  viewport?: { cols: number; rows: number }
  delivery?: MobileTerminalDeliveryState
  callbacks: MobileTerminalCallbacks
}

export type MobileTerminalMultiplexer = {
  subscribeTerminal: (args: MobileTerminalSubscribeArgs) => Promise<MobileMultiplexedTerminal>
  setAppState: (state: 'foreground' | 'background') => void
  controlConnectionChanged: (isConnected: boolean) => void
  close: () => void
}
