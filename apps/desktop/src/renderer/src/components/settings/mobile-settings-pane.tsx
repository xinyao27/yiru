import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

import {
  YIRU_ANDROID_LATEST_APK_URL,
  YIRU_IOS_TESTFLIGHT_URL
} from '../../../../shared/yiru-mobile-downloads'
import { MobilePane } from './mobile-pane'
import {
  getMobileOverviewSearchEntry,
  getMobileSidebarShortcutSearchEntry,
  getMobileSettingsPaneSearchEntries
} from './mobile-settings-search'
import { SearchableSetting } from './searchable-setting'
import { SettingsSwitchRow } from './settings-form-controls'
export { getMobileSettingsPaneSearchEntries }

export function MobileSettingsPane(): React.JSX.Element {
  const showMobileButton = useAppStore((s) => s.settings?.showMobileButton !== false)
  const updateSettings = useAppStore((s) => s.updateSettings)

  return (
    <div className="space-y-4">
      <SearchableSetting
        title={translate('auto.components.settings.MobileSettingsPane.e7a3ae8c4e', 'Mobile')}
        description={translate(
          'auto.components.settings.MobileSettingsPane.174f4a3c6d',
          'Control terminals and agents from your phone.'
        )}
        keywords={getMobileOverviewSearchEntry().keywords}
        className="space-y-3 py-2"
      >
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.MobileSettingsPane.c8491c17ef',
            'Control Yiru from your phone by scanning a QR code. Mobile downloads:'
          )}{' '}
          <button
            type="button"
            onClick={() => void window.api.shell.openUrl(YIRU_IOS_TESTFLIGHT_URL)}
            className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent cursor-pointer underline underline-offset-2 outline-none"
          >
            {translate('auto.components.settings.MobileSettingsPane.testFlight', 'TestFlight')}
          </button>{' '}
          <span aria-hidden="true">/</span>{' '}
          <button
            type="button"
            onClick={() => void window.api.shell.openUrl(YIRU_ANDROID_LATEST_APK_URL)}
            className="hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent cursor-pointer underline underline-offset-2 outline-none"
          >
            {translate('auto.components.settings.MobileSettingsPane.androidApk', 'Android APK')}
          </button>
          .
        </p>
      </SearchableSetting>

      <SearchableSetting
        title={translate(
          'auto.components.settings.MobileSettingsPane.1de96ec8a6',
          'Show Yiru Mobile Button'
        )}
        description={translate(
          'auto.components.settings.MobileSettingsPane.682293cadf',
          'Show the Yiru Mobile button at the top of the left sidebar.'
        )}
        keywords={getMobileSidebarShortcutSearchEntry().keywords}
      >
        {/* Why: the in-page removal toast points users to Settings > Mobile. */}
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.MobileSettingsPane.1de96ec8a6',
            'Show Yiru Mobile Button'
          )}
          description={translate(
            'auto.components.settings.MobileSettingsPane.d4f2b65f30',
            'Show the Yiru Mobile shortcut in the sidebar.'
          )}
          checked={showMobileButton}
          onChange={() => updateSettings({ showMobileButton: !showMobileButton })}
        />
      </SearchableSetting>

      <div className="border-border/60 bg-card/50 rounded-xl border p-4">
        <MobilePane />
      </div>
    </div>
  )
}
