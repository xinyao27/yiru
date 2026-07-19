export const SPOOL_CONNECT_TIMEOUT_MS = 10_000
export const SPOOL_REQUEST_TIMEOUT_MS = 30_000

export type SpoolPeerState =
  | 'idle'
  | 'awaiting-ready'
  | 'awaiting-authenticated'
  | 'ready'
  | 'closed'
