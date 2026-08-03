import type { ReactNode } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { Check } from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import { BottomDrawer } from './bottom-drawer'
import { MobileContentSection } from './content-section'

type PickerListDrawerProps<T extends { id: string; label: string }> = {
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
}: PickerListDrawerProps<T>): React.JSX.Element {
  return (
    <BottomDrawer visible={visible} onClose={onClose} contentScrollable={false}>
      <View className="px-1 pb-2">
        <Text className="text-muted-foreground text-xs font-medium">{title}</Text>
      </View>
      <MobileContentSection className="max-h-96 grow-0">
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerClassName={cn(items.length === 0 ? 'min-h-6' : undefined)}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          ItemSeparatorComponent={PickerSeparator}
          renderItem={({ item }) => {
            const selected = item.id === selectedId
            return (
              <Pressable
                className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
                onPress={() => {
                  onSelect(item)
                  onClose()
                }}
              >
                {renderIcon ? <View className="w-5 items-center">{renderIcon(item)}</View> : null}
                <Text
                  className={cn('flex-1 text-sm text-foreground', selected && 'font-semibold')}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <View className="w-5 items-center">
                  {selected ? <Check size={14} colorClassName="accent-foreground" /> : null}
                </View>
              </Pressable>
            )
          }}
        />
      </MobileContentSection>
    </BottomDrawer>
  )
}

function PickerSeparator() {
  return <View className="h-hairline bg-border mx-3" />
}
