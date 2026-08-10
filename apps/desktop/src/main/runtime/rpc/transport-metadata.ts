import { join } from 'node:path'

import type { RuntimeTransportMetadata } from '~shared/runtime-bootstrap'

type LocalRuntimeTransportMetadata = Extract<
  RuntimeTransportMetadata,
  { kind: 'unix' | 'named-pipe' }
>

export function createRuntimeTransportMetadata(
  userDataPath: string,
  pid: number,
  platform: NodeJS.Platform,
  runtimeId = 'runtime'
): LocalRuntimeTransportMetadata {
  const endpointSuffix = runtimeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 4) || 'rt'
  if (platform === 'win32') {
    return {
      kind: 'named-pipe',
      // Why: Windows named pipes do not get the same chmod hardening path as
      // Unix sockets, so include a per-runtime suffix to avoid exposing a
      // stable, guessable control endpoint name across launches.
      endpoint: `\\\\.\\pipe\\yiru-${pid}-${endpointSuffix}`
    }
  }
  return {
    kind: 'unix',
    endpoint: join(userDataPath, `o-${pid}-${endpointSuffix}.sock`)
  }
}
