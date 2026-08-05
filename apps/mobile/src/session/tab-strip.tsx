import { useCallback, useEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'

import type { MobileSessionTab } from './screen-state'
import { MobileSessionTabActions } from './tab-actions'
import { MobileSessionTabButton } from './tab-button'
import { resolveTabStripScrollOffset } from './tab-strip-scroll'

export type MobileSessionTabStripProps = {
  activeTabId: string | null
  disabled: boolean
  onNewTabPress: () => void
  onTabLongPress: (tab: MobileSessionTab) => void
  onTabPress: (tab: MobileSessionTab) => void
  tabs: MobileSessionTab[]
}

export function MobileSessionTabStrip({
  activeTabId,
  disabled,
  onNewTabPress,
  onTabLongPress,
  onTabPress,
  tabs
}: MobileSessionTabStripProps): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null)
  const scrollOffsetRef = useRef(0)
  const viewportWidthRef = useRef(0)
  const contentWidthRef = useRef(0)
  const tabLayoutsRef = useRef<Map<string, { x: number; width: number }>>(new Map())

  const scrollActiveTabIntoView = useCallback((tabId: string | null, animated: boolean) => {
    if (!tabId) {
      return
    }
    const layout = tabLayoutsRef.current.get(tabId)
    if (!layout) {
      return
    }
    const nextOffset = resolveTabStripScrollOffset({
      tabX: layout.x,
      tabWidth: layout.width,
      viewportWidth: viewportWidthRef.current,
      contentWidth: contentWidthRef.current,
      currentOffset: scrollOffsetRef.current
    })
    if (nextOffset !== scrollOffsetRef.current) {
      scrollOffsetRef.current = nextOffset
      scrollRef.current?.scrollTo({ x: nextOffset, animated })
    }
  }, [])

  useEffect(() => {
    const frameId = requestAnimationFrame(() => scrollActiveTabIntoView(activeTabId, true))
    return () => cancelAnimationFrame(frameId)
  }, [activeTabId, scrollActiveTabIntoView])

  return (
    <View className="mx-3 flex-row items-center gap-2">
      <View className="min-h-11 min-w-0 flex-1 overflow-hidden">
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          className="h-11"
          contentContainerClassName="items-center gap-2"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.x
          }}
          onLayout={(event) => {
            viewportWidthRef.current = event.nativeEvent.layout.width
            scrollActiveTabIntoView(activeTabId, false)
          }}
          onContentSizeChange={(width) => {
            contentWidthRef.current = width
            scrollActiveTabIntoView(activeTabId, false)
          }}
        >
          {tabs.map((tab) => (
            <MobileSessionTabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout
                tabLayoutsRef.current.set(tab.id, { x, width })
                if (tab.id === activeTabId) {
                  scrollActiveTabIntoView(tab.id, false)
                }
              }}
              onPress={() => onTabPress(tab)}
              onLongPress={() => onTabLongPress(tab)}
            />
          ))}
        </ScrollView>
      </View>
      <MobileSessionTabActions disabled={disabled} onNewTabPress={onNewTabPress} />
    </View>
  )
}
