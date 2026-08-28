import { createORPCClient, type ClientLink, type ClientOptions } from '@orpc/client'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import { callRuntimeOrpcByPath, type RuntimeClientTarget } from './orpc-client'
import type { RuntimeOrpcClient, RuntimeOrpcClientContext } from './orpc-connection'

class RuntimeTargetQueryLink implements ClientLink<RuntimeOrpcClientContext> {
  private readonly target: RuntimeClientTarget

  constructor(target: RuntimeClientTarget) {
    this.target = target
  }

  call(
    path: readonly string[],
    input: unknown,
    options: ClientOptions<RuntimeOrpcClientContext>
  ): Promise<unknown> {
    return callRuntimeOrpcByPath(this.target, path, input, {
      onBinary: options.context.onBinary,
      signal: options.signal
    })
  }
}

function createRuntimeTargetOrpc(target: RuntimeClientTarget) {
  const key = targetKey(target)
  const client = createORPCClient<RuntimeOrpcClient>(new RuntimeTargetQueryLink(target))
  return createTanstackQueryUtils(client, { path: ['runtime', key] })
}

type RuntimeTargetOrpc = ReturnType<typeof createRuntimeTargetOrpc>

const runtimeTargetOrpcByKey = new Map<string, RuntimeTargetOrpc>()

export function getRuntimeTargetOrpc(target: RuntimeClientTarget): RuntimeTargetOrpc {
  const key = targetKey(target)
  const existing = runtimeTargetOrpcByKey.get(key)
  if (existing) {
    return existing
  }
  const created = createRuntimeTargetOrpc(target)
  runtimeTargetOrpcByKey.set(key, created)
  return created
}

export function targetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}
