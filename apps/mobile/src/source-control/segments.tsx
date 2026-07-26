import { Pressable, Text } from 'react-native'

import { cn } from '@/style/class-names'

import { MobileGlassSurface } from '../components/glass/surface'
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
    <MobileGlassSurface
      className="mx-4 mt-3 flex-row overflow-hidden rounded-2xl"
      isInteractive
      accessibilityRole="tablist"
    >
      {SOURCE_CONTROL_HUB_TABS.map((tab) => {
        const isActive = tab === active
        return (
          <Pressable
            key={tab}
            className={cn(
              'min-h-10 flex-1 items-center justify-center border-b-2 border-b-transparent px-1',
              isActive && 'border-b-foreground bg-card',
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
    </MobileGlassSurface>
  )
}
