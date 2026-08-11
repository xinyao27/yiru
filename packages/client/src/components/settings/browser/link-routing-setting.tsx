import { Label } from '~renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~renderer/components/ui/select'
import { translate } from '~renderer/i18n/i18n'
import type { GlobalSettings } from '~shared/types'

import { SearchableSetting } from '../searchable-setting'

type BrowserLinkRoutingSettingProps = {
  settings: GlobalSettings
  linkRoutingDescription: string
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserLinkRoutingSetting({
  settings,
  linkRoutingDescription,
  updateSettings
}: BrowserLinkRoutingSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.browser.link.routing.setting.title',
        'Open Web Links In'
      )}
      description={linkRoutingDescription}
      keywords={[
        'browser',
        'system browser',
        'default browser',
        'browse tab',
        'links',
        'localhost',
        'webview',
        'markdown',
        'file',
        'editor',
        'terminal',
        'pull request'
      ]}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="space-y-0.5">
        <Label>
          {translate(
            'auto.components.settings.browser.link.routing.setting.title',
            'Open Web Links In'
          )}
        </Label>
        <p className="text-muted-foreground text-xs">{linkRoutingDescription}</p>
      </div>
      <Select
        value={settings.openLinksInApp ? 'browse-tab' : 'system-browser'}
        onValueChange={(value) => updateSettings({ openLinksInApp: value === 'browse-tab' })}
      >
        <SelectTrigger size="sm" className="w-48 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system-browser" className="text-xs">
            {translate(
              'auto.components.settings.browser.link.routing.setting.systemBrowser',
              'System default browser'
            )}
          </SelectItem>
          <SelectItem value="browse-tab" className="text-xs">
            {translate(
              'auto.components.settings.browser.link.routing.setting.browseTab',
              'Yiru Browse Tab'
            )}
          </SelectItem>
        </SelectContent>
      </Select>
    </SearchableSetting>
  )
}
