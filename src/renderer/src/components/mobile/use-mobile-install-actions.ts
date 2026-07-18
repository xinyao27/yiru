import { useCallback } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { getMobileReleaseLink } from './mobile-release-link'

export function useMobileInstallActions(): {
  copyInstallUrl: () => Promise<void>
  openInstallUrl: () => void
} {
  const mountedRef = useMountedRef()

  const openInstallUrl = useCallback((): void => {
    void window.api.shell.openUrl(getMobileReleaseLink().url)
  }, [])

  const copyInstallUrl = useCallback(async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(getMobileReleaseLink().url)
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
  }, [mountedRef])

  return { copyInstallUrl, openInstallUrl }
}
