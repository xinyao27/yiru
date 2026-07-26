import { Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import {
  SOURCE_CONTROL_HUB_TABS,
  SOURCE_CONTROL_HUB_TAB_LABELS,
  type SourceControlHubTab
} from './hub-tab'

type Props = {
  active: SourceControlHubTab
  onSelect: (tab: SourceControlHubTab) => void
}

// The hub's top-level lens switcher. Switching is local state (no route push) so
// scroll position and the shared branch card persist across Changes/PR/History.
export function MobileSourceControlSegments({ active, onSelect }: Props) {
  return (
    <View
      className="bg-card border-b-hairline border-b-border w-full flex-row items-stretch"
      accessibilityRole="tablist"
    >
      {SOURCE_CONTROL_HUB_TABS.map((tab) => {
        const isActive = tab === active
        return (
          <Pressable
            key={tab}
            className={cn(
              'flex-1 min-h-10 items-center justify-center px-1 border-b-2 border-b-transparent',
              isActive && 'border-b-foreground',
              !isActive && 'active:bg-accent'
            )}
            onPress={() => onSelect(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={SOURCE_CONTROL_HUB_TAB_LABELS[tab]}
          >
            <Text
              className={cn(
                'text-muted-foreground text-sm font-semibold',
                isActive && 'text-foreground'
              )}
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
