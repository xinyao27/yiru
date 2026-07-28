import { View } from 'react-native'

import { MobileGlassSegmentedControl } from '@/components/glass/segmented-control'
import type { MobileGlassSegmentOption } from '@/components/glass/segmented-control-props'

import type { MobileBrowserViewMode } from './screencast-request'

type Props = {
  disabled: boolean
  value: MobileBrowserViewMode
  onChange: (mode: MobileBrowserViewMode) => void
}

export const MOBILE_BROWSER_VIEW_MODES: { id: MobileBrowserViewMode; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' }
]

const MOBILE_BROWSER_VIEW_MODE_SEGMENTS: MobileGlassSegmentOption<MobileBrowserViewMode>[] =
  MOBILE_BROWSER_VIEW_MODES.map((mode) => ({ label: mode.label, value: mode.id }))

export function MobileBrowserViewModeSwitch({
  disabled,
  value,
  onChange
}: Props): React.JSX.Element {
  return (
    <View className="w-28">
      <MobileGlassSegmentedControl
        accessibilityLabel="Website view"
        disabled={disabled}
        options={MOBILE_BROWSER_VIEW_MODE_SEGMENTS}
        size="small"
        value={value}
        onChange={onChange}
      />
    </View>
  )
}
