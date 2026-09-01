export type AuthenticatedRpcPrincipal = {
  kind: 'paired-device'
  deviceId: string
  scope: 'mobile' | 'runtime'
}
