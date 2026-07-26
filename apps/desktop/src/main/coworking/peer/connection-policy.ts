export const COWORKING_CONNECT_TIMEOUT_MS = 10_000
export const COWORKING_REQUEST_TIMEOUT_MS = 30_000

export type CoworkingPeerState =
  | 'idle'
  | 'awaiting-ready'
  | 'awaiting-authenticated'
  | 'ready'
  | 'closed'
