import type { ShellWebConnectStatus } from '@yiru/runtime-protocol/contract'
import { useEffect, useState } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'
import { subscribeShellEvent } from '~renderer/runtime/shell-events-client'

// Why: the shell owns this state and pushes every change on the event stream, so
// the read here is a one-shot fetch plus a subscription rather than a poll.
export function useWebConnectStatus(): ShellWebConnectStatus | null {
  const [status, setStatus] = useState<ShellWebConnectStatus | null>(null)

  useEffect(() => {
    let active = true
    void shellClient.webConnect.getStatus().then(
      (initial) => {
        if (active) {
          setStatus(initial)
        }
      },
      () => {
        // Why: a host without this capability (the web build) simply has no
        // browser session to offer, and the surface stays hidden.
      }
    )
    const unsubscribe = subscribeShellEvent((event) => {
      if (event.type === 'webConnectStatus') {
        setStatus(event.status)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}
