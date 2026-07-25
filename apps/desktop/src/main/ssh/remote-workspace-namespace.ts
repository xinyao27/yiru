import { createHash } from 'node:crypto'

import type { SshTarget } from '@yiru/runtime-protocol/ssh-connection'

export function getRemoteWorkspaceNamespace(target: SshTarget): string {
  const stableKey = [
    target.configHost || target.host,
    target.host,
    String(target.port),
    target.username
  ].join('\n')
  return createHash('sha256').update(stableKey).digest('hex').slice(0, 32)
}
