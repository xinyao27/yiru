import { YIRU_ANDROID_LATEST_APK_URL, YIRU_IOS_TESTFLIGHT_URL } from '@yiru/workbench-model/product'

import { translate } from '@/i18n/i18n'

export function MobileRelayBetaAvailability(): React.JSX.Element {
  return (
    <span className="text-muted-foreground inline-flex flex-wrap items-baseline gap-x-1 text-[11px]">
      <span className="text-foreground/80 font-medium">
        {translate('auto.components.settings.MobileRelayBetaAvailability.beta', 'Beta')}
      </span>
      <span aria-hidden="true">—</span>
      <span>
        {translate(
          'auto.components.settings.MobileRelayBetaAvailability.availability',
          'Available on'
        )}
      </span>
      <button
        type="button"
        className="text-foreground decoration-border hover:decoration-foreground font-medium underline underline-offset-2 focus-visible:outline-none"
        onClick={() => void window.api.shell.openUrl(YIRU_IOS_TESTFLIGHT_URL)}
      >
        {translate('auto.components.settings.MobileRelayBetaAvailability.testFlight', 'TestFlight')}
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        className="text-foreground decoration-border hover:decoration-foreground font-medium underline underline-offset-2 focus-visible:outline-none"
        onClick={() => void window.api.shell.openUrl(YIRU_ANDROID_LATEST_APK_URL)}
      >
        {translate(
          'auto.components.settings.MobileRelayBetaAvailability.androidApk',
          'Android APK'
        )}
      </button>
    </span>
  )
}
