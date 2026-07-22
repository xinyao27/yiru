import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import { hubStyles } from './mobile-source-control-hub-styles'
import {
  SOURCE_CONTROL_HUB_TABS,
  SOURCE_CONTROL_HUB_TAB_LABELS,
  type SourceControlHubTab
} from './mobile-source-control-hub-tab'

type Props = {
  active: SourceControlHubTab
  onSelect: (tab: SourceControlHubTab) => void
}

// The hub's top-level lens switcher. Switching is local state (no route push) so
// scroll position and the shared branch card persist across Changes/PR/History.
export function MobileSourceControlSegments({ active, onSelect }: Props) {
  return (
    <View className={hubStyles.segments} accessibilityRole="tablist">
      {SOURCE_CONTROL_HUB_TABS.map((tab) => {
        const isActive = tab === active
        return (
          <Pressable
            key={tab}
            className={cn(
              hubStyles.segment,
              isActive && hubStyles.segmentActive,
              !isActive && hubStyles.segmentPressedActive
            )}
            onPress={() => onSelect(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={SOURCE_CONTROL_HUB_TAB_LABELS[tab]}
          >
            <Text
              className={cn(hubStyles.segmentText, isActive && hubStyles.segmentTextActive)}
              numberOfLines={1}
            >
              {SOURCE_CONTROL_HUB_TAB_LABELS[tab]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
