import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import type { RendererCommandResult } from '@/runtime/renderer-command-result-channel'

type YiruProfileResult = Extract<RendererCommandResult, { type: 'yiru-profile' }>

const FAILURE_TITLES = {
  'create-local': ['Failed to create profile', 'auto.store.slices.yiru.profiles.612f7f6861'],
  switch: ['Failed to switch profile', 'auto.store.slices.yiru.profiles.7d4bc516ee'],
  transfer: ['Failed to transfer project', 'auto.store.slices.yiru.profiles.f03ae7f27b'],
  'create-cloud': ['Failed to create cloud profile', 'auto.store.slices.yiru.profiles.f0c9e11a6d'],
  connect: ['Failed to connect profile', 'auto.store.slices.yiru.profiles.33290e88ed'],
  'refresh-auth': ['Failed to refresh profile auth', 'auto.store.slices.yiru.profiles.2f6c78a039'],
  'sign-out': ['Failed to sign out', 'auto.store.slices.yiru.profiles.83600521e7'],
  'select-org': ['Failed to switch organization', 'auto.store.slices.yiru.profiles.76deec8f58']
} as const

export function presentYiruProfileResult(result: YiruProfileResult): void {
  if (result.outcome === 'succeeded') {
    presentSuccess(result.operation)
    return
  }
  if (result.outcome === 'reconnect-required') {
    toast.error(translate('auto.store.slices.yiru.profiles.d6e764e7db', 'Reconnect this profile'))
    return
  }
  if (result.outcome === 'duplicate-target') {
    toast.error(
      translate(
        'auto.store.slices.yiru.profiles.f518e89aa5',
        'Project already exists in that profile'
      )
    )
    return
  }
  if (result.outcome === 'unconfigured') {
    toast.error(
      translate(
        'auto.store.slices.yiru.profiles.8b8fa73174',
        'Yiru Cloud sign-in is not configured'
      ),
      { description: result.error }
    )
    return
  }
  const [fallback, key] = FAILURE_TITLES[result.operation]
  toast.error(translate(key, fallback), result.error ? { description: result.error } : undefined)
}

function presentSuccess(operation: YiruProfileResult['operation']): void {
  const success = {
    'create-cloud': ['Cloud profile created', 'auto.store.slices.yiru.profiles.319d7cf39b'],
    connect: ['Profile connected', 'auto.store.slices.yiru.profiles.9fcb07a796'],
    'sign-out': ['Signed out of profile', 'auto.store.slices.yiru.profiles.a37b5e6d37']
  } as const
  const message = success[operation as keyof typeof success]
  if (message) {
    toast.success(translate(message[1], message[0]))
  }
}
