import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  clearHiddenRendererPtyDeliveryState,
  markHiddenRendererPty,
  setRendererPtyDeliveryInterest
} from '../ipc/pty-hidden-delivery-gate'
import { resolveTerminalQueryReplyOwner } from './terminal-model-query-authority'

const PTY_ID = 'query-authority-test'
const ENABLED_SETTINGS = {
  terminalMainSideEffectAuthority: true,
  terminalHiddenDeliveryGate: true,
  terminalModelQueryAuthority: true
}

afterEach(() => {
  clearHiddenRendererPtyDeliveryState(PTY_ID)
})

describe('terminal query reply owner', () => {
  it('assigns hidden dropped chunks to the model unless a remote view is attached', () => {
    markHiddenRendererPty(PTY_ID)

    expect(
      resolveTerminalQueryReplyOwner({
        ptyId: PTY_ID,
        settings: ENABLED_SETTINGS,
        hasRemoteViewSubscriber: false
      })
    ).toBe('model')
    expect(
      resolveTerminalQueryReplyOwner({
        ptyId: PTY_ID,
        settings: ENABLED_SETTINGS,
        hasRemoteViewSubscriber: true
      })
    ).toBe('remote-view')
  })

  it('keeps renderer authority for delivered or model-disabled chunks', () => {
    markHiddenRendererPty(PTY_ID)
    setRendererPtyDeliveryInterest(PTY_ID, true)

    expect(
      resolveTerminalQueryReplyOwner({
        ptyId: PTY_ID,
        settings: ENABLED_SETTINGS,
        hasRemoteViewSubscriber: false
      })
    ).toBe('renderer')

    setRendererPtyDeliveryInterest(PTY_ID, false)
    expect(
      resolveTerminalQueryReplyOwner({
        ptyId: PTY_ID,
        settings: { ...ENABLED_SETTINGS, terminalModelQueryAuthority: false },
        hasRemoteViewSubscriber: false
      })
    ).toBe('renderer')
  })
})
