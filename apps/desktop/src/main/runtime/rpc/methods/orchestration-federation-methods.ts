import type { RpcMethod } from '../core'
import { ORCHESTRATION_FEDERATION_ATTACH_METHODS } from './orchestration-federation'
import { ORCHESTRATION_FEDERATION_CONTROL_METHODS } from './orchestration-federation-control'
import { ORCHESTRATION_FEDERATION_RELAY_METHODS } from './orchestration-federation-relay'

export const ORCHESTRATION_FEDERATION_METHODS: RpcMethod[] = [
  ...ORCHESTRATION_FEDERATION_ATTACH_METHODS,
  ...ORCHESTRATION_FEDERATION_RELAY_METHODS,
  ...ORCHESTRATION_FEDERATION_CONTROL_METHODS
]
