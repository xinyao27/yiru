import { Label } from '~renderer/components/ui/label'
import { Switch } from '~renderer/components/ui/switch'
import { translate } from '~renderer/i18n/i18n'
import type { GlobalSettings } from '~shared/types'

import { SearchableSetting } from '../searchable-setting'

type BrowserLinkRoutingSettingProps = {
  settings: GlobalSettings
  linkRoutingDescription: string
  isMac: boolean
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserLinkRoutingSetting({
  settings,
  linkRoutingDescription,
  isMac,
  updateSettings
}: BrowserLinkRoutingSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.BrowserPane.d3eb69c0aa', 'Link Routing')}
      description={linkRoutingDescription}
      keywords={[
        'browser',
        'preview',
        'links',
        'localhost',
        'webview',
        'markdown',
        isMac ? 'cmd' : 'ctrl',
        'file',
        'editor'
      ]}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="space-y-0.5">
        <Label>
          {translate('auto.components.settings.BrowserPane.d3eb69c0aa', 'Link Routing')}
        </Label>
        <p className="text-muted-foreground text-xs">{linkRoutingDescription}</p>
      </div>
      <Switch
        checked={settings.openLinksInApp}
        onCheckedChange={(checked) =>
          updateSettings({ openLinksInApp: checked, openLinksInAppPreferencePrompted: true })
        }
      />
    </SearchableSetting>
  )
}
