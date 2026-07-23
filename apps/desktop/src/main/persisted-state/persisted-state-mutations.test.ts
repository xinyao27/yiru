import { describe, expect, it } from 'vite-plus/test'

import { getDefaultSettings, getDefaultUIState } from '../../shared/constants'
import { applyPersistedSettingsUpdate } from './persisted-settings-mutations'
import { applyPersistedUiUpdate } from './persisted-ui-mutations'

describe('persisted-state domain mutations', () => {
  it('normalizes settings updates and preserves sibling fields in nested state', () => {
    const current = getDefaultSettings('/home/tester')
    current.telemetry = {
      optedIn: true,
      installId: 'stable-install',
      existedBeforeTelemetryRelease: false
    }

    const mutation = applyPersistedSettingsUpdate(current, {
      showMenuBarIcon: false,
      minimizeToTrayOnClose: 'truthy-but-invalid' as never,
      telemetry: { optedIn: false } as never,
      notifications: { customSoundVolume: 150 } as never
    })

    expect(mutation.settings).toMatchObject({
      showMenuBarIcon: false,
      minimizeToTrayOnClose: false,
      telemetry: {
        optedIn: false,
        installId: 'stable-install',
        existedBeforeTelemetryRelease: false
      },
      notifications: { customSoundVolume: 100 }
    })
    expect(mutation.changedUpdates).toMatchObject({
      showMenuBarIcon: false,
      telemetry: { optedIn: false, installId: 'stable-install' },
      notifications: { customSoundVolume: 100 }
    })
  })

  it('merges stale UI education updates without lowering recorded usage', () => {
    const current = getDefaultUIState()
    current.featureInteractions = {
      'automation-run': { firstInteractedAt: 200, interactionCount: 5 }
    }

    const mutation = applyPersistedUiUpdate(current, {
      featureInteractions: {
        'automation-run': { firstInteractedAt: 100, interactionCount: 2 }
      }
    })

    expect(mutation.changed).toBe(true)
    expect(mutation.ui.featureInteractions).toEqual({
      'automation-run': { firstInteractedAt: 100, interactionCount: 5 }
    })
  })
})
