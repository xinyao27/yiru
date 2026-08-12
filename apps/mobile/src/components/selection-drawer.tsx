import { cn } from 'cnfast'
import type { ReactNode } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { Check } from '~/components/uniwind-icons'

import { BottomDrawer } from './bottom-drawer'
import { MobileContentSection } from './content-section'

export type SelectionDrawerOption<TValue, TId extends string = string> = {
  id: TId
  value: TValue
  label: string
  supportingText?: string
  disabled?: boolean
  leading?: ReactNode
}

type SelectionDrawerProps<TValue, TId extends string = string> = {
  visible: boolean
  title: string
  options: readonly SelectionDrawerOption<TValue, TId>[]
  selectedId: TId | null
  onSelect: (value: TValue) => void
  onClose: () => void
}

export function SelectionDrawer<TValue, TId extends string>({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose
}: SelectionDrawerProps<TValue, TId>): React.JSX.Element {
  return (
    <BottomDrawer visible={visible} onClose={onClose} contentScrollable={false} title={title}>
      <MobileContentSection className="max-h-96 grow-0">
        <FlatList
          data={options}
          ItemSeparatorComponent={SelectionSeparator}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(option) => option.id}
          nestedScrollEnabled
          renderItem={({ item }) => (
            <SelectionRow
              option={item}
              selected={item.id === selectedId}
              onPress={() => {
                onSelect(item.value)
                onClose()
              }}
            />
          )}
        />
      </MobileContentSection>
    </BottomDrawer>
  )
}

type SelectionRowProps<TValue, TId extends string> = {
  option: SelectionDrawerOption<TValue, TId>
  selected: boolean
  onPress: () => void
}

function SelectionRow<TValue, TId extends string>({
  option,
  selected,
  onPress
}: SelectionRowProps<TValue, TId>): React.JSX.Element {
  const isDisabled = option.disabled === true

  return (
    <Pressable
      accessibilityHint={option.supportingText}
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: isDisabled }}
      className="active:bg-accent min-h-11 flex-row items-center gap-3 px-3 py-2"
      disabled={isDisabled}
      onPress={onPress}
    >
      {option.leading ? (
        <View
          accessibilityElementsHidden
          className={cn('w-6 shrink-0 items-center', isDisabled && 'opacity-50')}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {option.leading}
        </View>
      ) : null}
      <View className={cn('min-w-0 flex-1', isDisabled && 'opacity-50')}>
        <Text
          className={cn('text-foreground text-sm', selected && 'font-semibold')}
          numberOfLines={1}
        >
          {option.label}
        </Text>
        {option.supportingText ? (
          <Text className="text-muted-foreground mt-0.5 text-xs" numberOfLines={2}>
            {option.supportingText}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        className={cn('w-5 shrink-0 items-center', isDisabled && 'opacity-50')}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {selected ? <Check size={14} colorClassName="accent-foreground" /> : null}
      </View>
    </Pressable>
  )
}

function SelectionSeparator(): React.JSX.Element {
  return <View className="bg-border h-hairline mx-3" />
}
