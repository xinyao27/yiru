import type { ReactNode } from 'react'
import { View, Text, Pressable } from 'react-native'

import { Check } from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import { BottomDrawer } from './bottom-drawer'
import { MobileContentSection } from './content-section'

export type PickerOption<T extends string = string> = {
  value: T
  label: string
  subtitle?: string
  disabled?: boolean
  renderIcon?: (selected: boolean) => ReactNode
}

type Props<T extends string = string> = {
  visible: boolean
  title: string
  options: PickerOption<T>[]
  selected: T
  onSelect: (value: T) => void
  onLongSelect?: (value: T) => void
  onClose: () => void
}

type PickerModalContentProps<T extends string = string> = Pick<
  Props<T>,
  'options' | 'selected' | 'onSelect' | 'onLongSelect' | 'onClose'
>

export function PickerModal<T extends string = string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onLongSelect,
  onClose
}: Props<T>) {
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View className="px-1 pb-2">
        <Text className="text-muted-foreground text-xs font-medium">{title}</Text>
      </View>

      <PickerModalContent
        options={options}
        selected={selected}
        onSelect={onSelect}
        onLongSelect={onLongSelect}
        onClose={onClose}
      />
    </BottomDrawer>
  )
}

function PickerModalContent<T extends string = string>({
  options,
  selected,
  onSelect,
  onLongSelect,
  onClose
}: PickerModalContentProps<T>) {
  // Why: closed BottomDrawer instances return null, so keeping option rows in
  // this child avoids rebuilding hidden picker contents on every parent render.
  return (
    <MobileContentSection>
      {options.map((opt, i) => {
        const isSelected = opt.value === selected
        return (
          <View key={opt.value}>
            {i > 0 && <View className="h-hairline bg-border mx-3" />}
            <Pressable
              disabled={opt.disabled}
              className={cn(
                'flex-row items-center py-3 px-3',
                !opt.disabled && 'active:bg-accent',
                opt.disabled && 'opacity-50'
              )}
              onPress={() => {
                if (opt.disabled) {
                  return
                }
                onSelect(opt.value)
                onClose()
              }}
              onLongPress={
                onLongSelect
                  ? () => {
                      if (opt.disabled) {
                        return
                      }
                      onLongSelect(opt.value)
                      onClose()
                    }
                  : undefined
              }
            >
              {opt.renderIcon ? (
                <View className="w-5 items-center">{opt.renderIcon(isSelected)}</View>
              ) : null}
              <View className="min-w-0 flex-1">
                <Text className={cn('text-sm text-foreground', isSelected && 'font-semibold')}>
                  {opt.label}
                </Text>
                {opt.subtitle ? (
                  <Text className="text-muted-foreground mt-1 text-xs">{opt.subtitle}</Text>
                ) : null}
              </View>
              <View className="w-5 items-center">
                {isSelected ? <Check size={16} colorClassName="accent-foreground" /> : null}
              </View>
            </Pressable>
          </View>
        )
      })}
    </MobileContentSection>
  )
}
