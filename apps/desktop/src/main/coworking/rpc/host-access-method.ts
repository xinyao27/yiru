import { z } from 'zod'

import type { CoworkingHostAccessAuthority } from '../host-access-authority'
import type { CoworkingRpcMethodSpec } from './gateway'

const HostAccessRequestParams = z.object({}).strict()

export function createCoworkingHostAccessMethod(
  authority: CoworkingHostAccessAuthority
): CoworkingRpcMethodSpec {
  return {
    name: 'host.request',
    schema: HostAccessRequestParams,
    access: 'catalog-read',
    bind: () => ({ value: null, isCurrent: () => true }),
    execute: (_bound, context) => authority.request(context.principal, context.signal),
    project: (result) => result
  }
}
