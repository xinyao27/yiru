import type { ReactNode } from 'react'
import { View, Text, Pressable } from 'react-native'

import { Check } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'

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
  zIndex?: number
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
  onClose,
  zIndex
}: Props<T>) {
  return (
    <BottomDrawer visible={visible} onClose={onClose} zIndex={zIndex}>
      <View className={styles.header}>
        <Text className={styles.title}>{title}</Text>
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
    <View className={styles.group}>
      {options.map((opt, i) => {
        const isSelected = opt.value === selected
        return (
          <View key={opt.value}>
            {i > 0 && <View className={styles.separator} />}
            <Pressable
              disabled={opt.disabled}
              className={cn(
                styles.row,
                !opt.disabled && styles.rowPressedActive,
                opt.disabled && styles.rowDisabled
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
                <View className={styles.rowIcon}>{opt.renderIcon(isSelected)}</View>
              ) : null}
              <View className={styles.rowContent}>
                <Text className={cn(styles.rowLabel, isSelected && styles.rowLabelSelected)}>
                  {opt.label}
                </Text>
                {opt.subtitle ? <Text className={styles.rowSubtitle}>{opt.subtitle}</Text> : null}
              </View>
              {isSelected && <Check size={16} colorClassName="accent-foreground" />}
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

const styles = {
  header: cn('px-1 pb-2'),
  title: cn('text-[13px] font-medium text-muted-foreground/60'),
  group: cn('bg-card rounded-none overflow-hidden'),
  separator: cn('h-hairline bg-border mx-3'),
  row: cn('flex-row items-center py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowDisabled: cn('opacity-[0.45]'),
  rowContent: cn('flex-1 min-w-0'),
  rowIcon: cn('w-[22px] items-center mr-2'),
  rowLabel: cn('text-[14px] text-foreground'),
  rowLabelSelected: cn('font-semibold'),
  rowSubtitle: cn('text-[11px] text-muted-foreground/60 mt-[1px]')
} as const
