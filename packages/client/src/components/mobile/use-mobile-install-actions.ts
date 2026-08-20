import { useCallback, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/components/editor/http-link-routing'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

import { getMobileReleaseLink, type MobilePlatform } from './release-link'

export function useMobileInstallActions(platform: MobilePlatform): {
  copyInstallUrl: () => Promise<void>
  openInstallUrl: (event: MouseEvent<HTMLButtonElement>) => void
} {
  const mountedRef = useMountedRef()

  const openInstallUrl = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      openHttpLink(getMobileReleaseLink(platform).url, { event })
    },
    [platform]
  )

  const copyInstallUrl = useCallback(async (): Promise<void> => {
    try {
      await shellClient.ui.writeClipboardText(getMobileReleaseLink(platform).url)
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.mobile.MobilePage.fad833de8d', 'Install link copied')
        )
      }
    } catch (error) {
      console.error('writeClipboardText failed', error)
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.mobile.MobilePage.baea63c445', 'Failed to copy link')
        )
      }
    }
  }, [mountedRef, platform])

  return { copyInstallUrl, openInstallUrl }
}
