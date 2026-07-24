import { EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import { useEffect, useState } from 'react'

import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'

import type { RuntimeRemoteSshSupport } from './worktree-path-opening'

export function useRuntimeRemoteSshSupport(
  runtimeEnvironmentId?: string | null,
  connectionId?: string | null
): RuntimeRemoteSshSupport {
  const [support, setSupport] = useState<RuntimeRemoteSshSupport>('not-needed')

  useEffect(() => {
    if (!runtimeEnvironmentId?.trim() || !connectionId?.trim()) {
      setSupport('not-needed')
      return
    }
    let active = true
    setSupport('checking')
    void runtimeEnvironmentSupportsCapability(
      runtimeEnvironmentId,
      EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY
    )
      .then((supported) => {
        if (active) {
          setSupport(supported ? 'supported' : 'unsupported')
        }
      })
      .catch(() => {
        if (active) {
          setSupport('unsupported')
        }
      })
    return () => {
      active = false
    }
  }, [connectionId, runtimeEnvironmentId])

  return support
}
