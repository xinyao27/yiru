export type TailnetPrincipal = {
  nodeId: string
  sourceAddress: string
  userDisplayName: string
  nodeDisplayName: string
}

export type AuthenticatedSpoolPrincipal = {
  kind: 'spool'
  connectionId: string
  tailnet: TailnetPrincipal
  channelKeyFingerprint: string
}

export type AuthenticatedRpcPrincipal =
  | { kind: 'paired-device'; deviceId: string; scope: 'mobile' | 'runtime' }
  | AuthenticatedSpoolPrincipal
