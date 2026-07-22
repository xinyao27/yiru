import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { Check } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer, BOTTOM_DRAWER_HIDE_DURATION_MS } from './bottom-drawer'

type Props<T extends { id: string; label: string }> = {
  visible: boolean
  title: string
  items: T[]
  selectedId: string
  onSelect: (item: T) => void
  onClose: () => void
  renderIcon?: (item: T) => ReactNode
}

export function PickerListDrawer<T extends { id: string; label: string }>({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  renderIcon
}: Props<T>) {
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawerVisible = visible && !closing

  useEffect(() => {
    if (visible) {
      setClosing(false)
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [visible])

  const finishClose = useCallback(() => {
    setClosing(false)
    onClose()
  }, [onClose])

  const closeThenSelect = useCallback(
    (item: T) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        onClose()
        onSelect(item)
      }, BOTTOM_DRAWER_HIDE_DURATION_MS)
    },
    [onClose, onSelect]
  )

  return (
    <BottomDrawer
      visible={drawerVisible}
      onClose={finishClose}
      dragContentToDismiss={false}
      contentScrollable={false}
    >
      <View className={styles.header}>
        <Text className={styles.title}>{title}</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        className={styles.group}
        contentContainerClassName={cn(items.length === 0 ? styles.emptyContent : undefined)}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        ItemSeparatorComponent={PickerSeparator}
        renderItem={({ item }) => {
          const selected = item.id === selectedId
          return (
            <Pressable
              className={cn(styles.item, styles.itemPressedActive)}
              onPress={() => closeThenSelect(item)}
            >
              {renderIcon?.(item)}
              <Text
                className={cn(styles.itemText, selected && styles.itemTextSelected)}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {selected && <Check size={14} colorClassName="accent-foreground" />}
            </Pressable>
          )
        }}
      />
    </BottomDrawer>
  )
}

function PickerSeparator() {
  return <View className={styles.separator} />
}

const styles = {
  header: cn('px-1 pb-2'),
  title: cn('text-[13px] font-medium text-muted-foreground/60'),
  group: cn('bg-card rounded-none overflow-hidden max-h-[420px] grow-0'),
  emptyContent: cn('min-h-6'),
  separator: cn('h-hairline bg-border mx-3'),
  item: cn('flex-row items-center gap-2 py-3 px-3.5'),
  itemPressedActive: cn('active:bg-secondary'),
  itemText: cn('flex-1 text-[14px] text-foreground'),
  itemTextSelected: cn('font-semibold')
} as const
