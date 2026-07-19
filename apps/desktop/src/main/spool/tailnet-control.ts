import type { TailnetPrincipal } from '../../shared/spool/spool-wire-contract'

export type { TailnetPrincipal } from '../../shared/spool/spool-wire-contract'

export type TailnetNode = {
  nodeId: string
  addresses: readonly string[]
  userDisplayName: string
  nodeDisplayName: string
  online: boolean | null
}

export type TailnetSnapshot = {
  self: TailnetNode
  peers: readonly TailnetNode[]
  capturedAt: number
}

export type TailnetFlowAddress = {
  host: string
  port: number | null
}

export type TailnetControl = {
  readSnapshot(): Promise<TailnetSnapshot>
  identifySource(address: TailnetFlowAddress): Promise<TailnetPrincipal | null>
}

export type TailnetControlErrorCode =
  | 'not-running'
  | 'permission-denied'
  | 'timed-out'
  | 'unavailable'
  | 'unsupported-output'

export class TailnetControlError extends Error {
  constructor(
    readonly code: TailnetControlErrorCode,
    options?: ErrorOptions
  ) {
    super(`tailscale_${code}`, options)
    this.name = 'TailnetControlError'
  }
}
