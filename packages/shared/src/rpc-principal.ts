export type TailnetPrincipal = {
  nodeId: string
  sourceAddress: string
  userDisplayName: string
  nodeDisplayName: string
}

export type AuthenticatedCoworkingPrincipal = {
  kind: 'coworking'
  connectionId: string
  tailnet: TailnetPrincipal
  channelKeyFingerprint: string
}

export type AuthenticatedRpcPrincipal =
  | { kind: 'paired-device'; deviceId: string; scope: 'mobile' | 'runtime' | 'coworking-host' }
  | AuthenticatedCoworkingPrincipal
