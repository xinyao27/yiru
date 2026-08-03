import { View } from 'react-native'

import { MobileSegmentedControl, type MobileSegmentOption } from '~/components/segmented-control'
import { translate } from '~/i18n/translate'

import type { MobileBrowserViewMode } from './screencast-request'

type Props = {
  disabled: boolean
  value: MobileBrowserViewMode
  onChange: (mode: MobileBrowserViewMode) => void
}

export const MOBILE_BROWSER_VIEW_MODES: { id: MobileBrowserViewMode; label: string }[] = [
  { id: 'web', label: translate('mobile.browser.viewMode.web', 'Web') },
  { id: 'mobile', label: translate('mobile.browser.viewMode.mobile', 'Mobile') }
]

const MOBILE_BROWSER_VIEW_MODE_SEGMENTS: MobileSegmentOption<MobileBrowserViewMode>[] =
  MOBILE_BROWSER_VIEW_MODES.map((mode) => ({ label: mode.label, value: mode.id }))

export function MobileBrowserViewModeSwitch({
  disabled,
  value,
  onChange
}: Props): React.JSX.Element {
  return (
    <View className="w-28">
      <MobileSegmentedControl
        accessibilityLabel={translate('mobile.browser.viewMode.label', 'Website view')}
        disabled={disabled}
        options={MOBILE_BROWSER_VIEW_MODE_SEGMENTS}
        value={value}
        onChange={onChange}
      />
    </View>
  )
}
