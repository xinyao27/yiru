// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isRecoverableSpoolTerminalError,
  useSpoolTerminalReconnect
} from './useSpoolTerminalReconnect'

type ReconnectControls = ReturnType<typeof useSpoolTerminalReconnect>
const INITIAL_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000]

function Probe({
  onControls,
  onAttempt
}: {
  onControls: (controls: ReconnectControls) => void
  onAttempt: () => void
}): null {
  onControls(
    useSpoolTerminalReconnect({
      isCurrent: () => true,
      onPending: vi.fn(),
      onAttempt
    })
  )
  return null
}

describe('useSpoolTerminalReconnect', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('keeps retrying a recoverable active terminal after the initial backoff budget', () => {
    const onAttempt = vi.fn()
    let controls: ReconnectControls | null = null
    act(() => {
      root.render(
        <Probe
          onControls={(next) => {
            controls = next
          }}
          onAttempt={onAttempt}
        />
      )
    })

    act(() => controls?.startReconnect())
    expect(onAttempt).toHaveBeenCalledOnce()
    for (const delay of INITIAL_RECONNECT_DELAYS_MS) {
      act(() => controls?.retryReconnect())
      act(() => vi.advanceTimersByTime(delay))
    }
    expect(onAttempt).toHaveBeenCalledTimes(9)

    act(() => controls?.retryReconnect())
    act(() => vi.advanceTimersByTime(8_000))
    expect(onAttempt).toHaveBeenCalledTimes(10)
  })

  it('cancels capped retries when the active terminal unmounts', () => {
    const onAttempt = vi.fn()
    let controls: ReconnectControls | null = null
    act(() => {
      root.render(
        <Probe
          onControls={(next) => {
            controls = next
          }}
          onAttempt={onAttempt}
        />
      )
    })
    act(() => controls?.startReconnect())
    act(() => controls?.retryReconnect())
    act(() => root.unmount())
    act(() => vi.advanceTimersByTime(8_000))

    expect(onAttempt).toHaveBeenCalledOnce()
    root = createRoot(container)
  })
})

describe('isRecoverableSpoolTerminalError', () => {
  it('keeps protocol failures outside the automatic retry loop', () => {
    expect(isRecoverableSpoolTerminalError('protocol_error')).toBe(false)
  })

  it('only retries a missing alias after the terminal was previously live', () => {
    expect(isRecoverableSpoolTerminalError('resource_not_found')).toBe(false)
    expect(isRecoverableSpoolTerminalError('resource_not_found', true)).toBe(true)
  })
})
