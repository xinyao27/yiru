import { View } from 'react-native'

import { MobileSegmentedControl, type MobileSegmentOption } from '../components/segmented-control'
import { translate } from '../i18n/translate'
import {
  SOURCE_CONTROL_HUB_TABS,
  SOURCE_CONTROL_HUB_TAB_LABELS,
  type SourceControlHubTab
} from './hub-tab'

type Props = {
  active: SourceControlHubTab
  onSelect: (tab: SourceControlHubTab) => void
}

const SOURCE_CONTROL_SEGMENTS: MobileSegmentOption<SourceControlHubTab>[] =
  SOURCE_CONTROL_HUB_TABS.map((value) => ({
    label: SOURCE_CONTROL_HUB_TAB_LABELS[value],
    value
  }))

// The hub's top-level lens switcher. Switching is local state (no route push) so
// scroll position and the shared branch card persist across Changes/PR/History.
export function MobileSourceControlSegments({ active, onSelect }: Props) {
  return (
    <View className="mx-4 mt-3">
      <MobileSegmentedControl
        accessibilityLabel={translate(
          'mobile.sourceControl.segmentedView.label',
          'Source control view'
        )}
        options={SOURCE_CONTROL_SEGMENTS}
        value={active}
        onChange={onSelect}
      />
    </View>
  )
}
