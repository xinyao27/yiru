import { cn } from 'cnfast'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, View, Text, Pressable, type AppStateStatus } from 'react-native'
import type Animated from 'react-native-reanimated'
import type { AnimatedRef, SharedValue } from 'react-native-reanimated'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { CaretRight as ChevronRight } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { TERMINAL_ACCESSORY_KEYS, type TerminalAccessoryKey } from './accessory-keys'
import {
  getDefaultTerminalAccessoryLayout,
  loadTerminalAccessoryLayout,
  reorderTerminalAccessoryBuiltInIds,
  saveTerminalAccessoryLayout,
  setTerminalAccessoryBuiltInVisible,
  type TerminalAccessoryLayout
} from './accessory-layout'
import { CustomKeyModal, loadCustomKeys, saveCustomKeys, type CustomKey } from './custom-key-modal'
import { DragReorderList } from './drag-reorder-list'

// Why: DragReorderList absolutely positions rows, so every row in a
// reorderable section must share one fixed height.
const REORDER_ROW_HEIGHT = 56

function ShortcutBarRow({
  shortcutKey,
  visible,
  onToggle
}: {
  shortcutKey: TerminalAccessoryKey
  visible: boolean
  onToggle: (visible: boolean) => void
}): React.JSX.Element {
  return (
    <View className={styles.reorderRowContent}>
      <View className={styles.keycap}>
        <Text className={styles.keycapText}>{shortcutKey.label}</Text>
      </View>
      <View className="flex-1">
        <SettingsToggleRow
          inset="none"
          label={shortcutKey.accessibilityLabel ?? shortcutKey.label}
          labelLines={1}
          onValueChange={onToggle}
          value={visible}
        />
      </View>
    </View>
  )
}

type Props = {
  scrollRef: AnimatedRef<Animated.ScrollView>
  scrollOffsetY: SharedValue<number>
  scrollContentHeight: SharedValue<number>
  onDragActiveChange: (active: boolean) => void
}

export function TerminalShortcutSettings({
  scrollRef,
  scrollOffsetY,
  scrollContentHeight,
  onDragActiveChange
}: Props): React.JSX.Element {
  const [customKeys, setCustomKeys] = useState<CustomKey[]>([])
  const [showCustomKeyModal, setShowCustomKeyModal] = useState(false)
  const [shortcutLayout, setShortcutLayout] = useState<TerminalAccessoryLayout>(
    getDefaultTerminalAccessoryLayout
  )
  const layoutWriteChainRef = useRef<Promise<void>>(Promise.resolve())
  const layoutWriteSeqRef = useRef(0)
  const pendingLayoutWritesRef = useRef(0)

  const persistLayout = useCallback((next: TerminalAccessoryLayout) => {
    layoutWriteSeqRef.current += 1
    pendingLayoutWritesRef.current += 1
    layoutWriteChainRef.current = layoutWriteChainRef.current
      .catch(() => {})
      .then(() => saveTerminalAccessoryLayout(next))
      .catch(() => {})
      .finally(() => {
        pendingLayoutWritesRef.current -= 1
      })
  }, [])

  const refreshShortcutLayout = useCallback(() => {
    const refreshSeq = layoutWriteSeqRef.current
    void loadTerminalAccessoryLayout().then((layout) => {
      if (pendingLayoutWritesRef.current > 0 || refreshSeq !== layoutWriteSeqRef.current) {
        return
      }
      setShortcutLayout({
        orderedBuiltInIds: layout.orderedBuiltInIds,
        visibleBuiltInIds: layout.visibleBuiltInIds
      })
    })
  }, [])

  const customKeysWriteChainRef = useRef<Promise<void>>(Promise.resolve())
  const customKeysWriteSeqRef = useRef(0)
  const pendingCustomKeysWritesRef = useRef(0)

  // Why: same stale-snapshot guard as persistLayout — a focus/AppState refresh
  // racing an in-flight save must not overwrite the optimistic state.
  const persistCustomKeys = useCallback((next: CustomKey[]) => {
    customKeysWriteSeqRef.current += 1
    pendingCustomKeysWritesRef.current += 1
    customKeysWriteChainRef.current = customKeysWriteChainRef.current
      .catch(() => {})
      .then(() => saveCustomKeys(next))
      .catch(() => {})
      .finally(() => {
        pendingCustomKeysWritesRef.current -= 1
      })
  }, [])

  const refreshCustomKeys = useCallback(() => {
    const refreshSeq = customKeysWriteSeqRef.current
    void loadCustomKeys().then((keys) => {
      if (pendingCustomKeysWritesRef.current > 0 || refreshSeq !== customKeysWriteSeqRef.current) {
        return
      }
      setCustomKeys(keys)
    })
  }, [])

  const handleDeleteCustomKey = useCallback(
    (key: CustomKey) => {
      setCustomKeys((current) => {
        const updated = current.filter((k) => k.id !== key.id)
        persistCustomKeys(updated)
        return updated
      })
    },
    [persistCustomKeys]
  )

  useFocusEffect(
    useCallback(() => {
      refreshShortcutLayout()
      refreshCustomKeys()
    }, [refreshShortcutLayout, refreshCustomKeys])
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        refreshShortcutLayout()
        refreshCustomKeys()
      }
    })
    return () => sub.remove()
  }, [refreshShortcutLayout, refreshCustomKeys])

  const toggleBuiltInKey = useCallback(
    (id: string, visible: boolean) => {
      setShortcutLayout((current) => {
        const next = setTerminalAccessoryBuiltInVisible(current, id, visible)
        persistLayout(next)
        return next
      })
    },
    [persistLayout]
  )

  const reorderBuiltInKeys = useCallback(
    (orderedKeys: string[]) => {
      setShortcutLayout((current) => {
        const next = reorderTerminalAccessoryBuiltInIds(current, orderedKeys)
        persistLayout(next)
        return next
      })
    },
    [persistLayout]
  )

  const resetBuiltInKeys = useCallback(() => {
    const next = getDefaultTerminalAccessoryLayout()
    setShortcutLayout(next)
    persistLayout(next)
  }, [persistLayout])

  const reorderCustomKeys = useCallback(
    (orderedKeys: string[]) => {
      setCustomKeys((current) => {
        const byId = new Map(current.map((key) => [key.id, key]))
        const reordered = orderedKeys.flatMap((id) => {
          const key = byId.get(id)
          return key ? [key] : []
        })
        if (reordered.length !== current.length) {
          return current
        }
        persistCustomKeys(reordered)
        return reordered
      })
    },
    [persistCustomKeys]
  )

  const visibleBuiltInSet = useMemo(
    () => new Set(shortcutLayout.visibleBuiltInIds),
    [shortcutLayout.visibleBuiltInIds]
  )
  const orderedAccessoryKeys = useMemo(() => {
    const byId = new Map(TERMINAL_ACCESSORY_KEYS.map((key) => [key.id, key]))
    return shortcutLayout.orderedBuiltInIds.flatMap((id) => {
      const key = byId.get(id)
      return key ? [key] : []
    })
  }, [shortcutLayout.orderedBuiltInIds])

  return (
    <>
      <Text className={cn(styles.groupHeading, styles.groupTopGap)}>
        {translate('mobile.terminalShortcut.shortcutBarHeading', 'SHORTCUT BAR')}
      </Text>
      <Text className="text-muted-foreground px-1 text-xs leading-5">
        {translate(
          'mobile.terminalShortcut.shortcutBarDescription',
          'Toggle keys to show or hide them, and hold the grip to drag a key into the order you want on the terminal shortcut bar.'
        )}
      </Text>
      <MobileContentSection className={cn(styles.section, styles.sectionTopGap)}>
        <DragReorderList
          items={orderedAccessoryKeys}
          itemKey={(shortcutKey) => shortcutKey.id}
          rowHeight={REORDER_ROW_HEIGHT}
          scrollRef={scrollRef}
          scrollOffsetY={scrollOffsetY}
          scrollContentHeight={scrollContentHeight}
          onDragActiveChange={onDragActiveChange}
          onReorder={reorderBuiltInKeys}
          renderRow={(shortcutKey) => (
            <ShortcutBarRow
              shortcutKey={shortcutKey}
              visible={visibleBuiltInSet.has(shortcutKey.id)}
              onToggle={(visible) => toggleBuiltInKey(shortcutKey.id, visible)}
            />
          )}
        />
        <Pressable className={cn(styles.row, styles.rowPressedActive)} onPress={resetBuiltInKeys}>
          <View className={styles.rowContent}>
            <Text className={styles.rowLabel}>
              {translate('mobile.terminalShortcut.resetDefaults', 'Reset Defaults')}
            </Text>
            <Text className={styles.rowSublabel}>
              {translate(
                'mobile.terminalShortcut.resetDefaultsDescription',
                'Show every built-in shortcut key in the original order'
              )}
            </Text>
          </View>
        </Pressable>
      </MobileContentSection>

      <Text className={cn(styles.groupHeading, styles.groupTopGap)}>
        {translate('mobile.terminalShortcut.customShortcutsHeading', 'CUSTOM SHORTCUTS')}
      </Text>
      <MobileContentSection className={cn(styles.section, styles.sectionTopGap)}>
        {customKeys.length === 0 ? (
          <>
            <View className="items-center justify-center p-3">
              <Text className="text-muted-foreground p-3 text-sm">
                {translate(
                  'mobile.terminalShortcut.noCustomShortcuts',
                  'No custom shortcuts defined yet.'
                )}
              </Text>
            </View>
            <View className="h-hairline bg-border mx-3" />
          </>
        ) : (
          <DragReorderList
            items={customKeys}
            itemKey={(key) => key.id}
            rowHeight={REORDER_ROW_HEIGHT}
            scrollRef={scrollRef}
            scrollOffsetY={scrollOffsetY}
            scrollContentHeight={scrollContentHeight}
            onDragActiveChange={onDragActiveChange}
            onReorder={reorderCustomKeys}
            renderRow={(key) => (
              <View className={styles.reorderRowContent}>
                <View className={styles.keycap}>
                  <Text className={styles.keycapText}>{key.label}</Text>
                </View>
                <View className={styles.rowContent}>
                  <Text className={styles.rowLabel}>{key.label}</Text>
                  <Text className={styles.rowSublabel} numberOfLines={1} ellipsizeMode="tail">
                    {key.bytes.replace(/\r/g, ' ↵')}
                  </Text>
                </View>
                <MobileGlassIconButton
                  accessibilityLabel={translate(
                    'mobile.terminalShortcut.deleteCustomShortcut',
                    'Delete {{label}}',
                    { label: key.label }
                  )}
                  icon="delete"
                  isDestructive
                  onPress={() => handleDeleteCustomKey(key)}
                  size="small"
                />
              </View>
            )}
          />
        )}
        <Pressable
          className={cn(styles.row, styles.rowPressedActive)}
          onPress={() => setShowCustomKeyModal(true)}
        >
          <View className={styles.rowContent}>
            <Text className={styles.rowLabel}>
              {translate('mobile.terminalShortcut.addCustomShortcut', 'Add Custom Shortcut…')}
            </Text>
            <Text className={styles.rowSublabel}>
              {translate(
                'mobile.terminalShortcut.addCustomShortcutDescription',
                'Create key combo or text macro'
              )}
            </Text>
          </View>
          <View className="w-5 items-center">
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </View>
        </Pressable>
      </MobileContentSection>

      <CustomKeyModal
        visible={showCustomKeyModal}
        onClose={() => setShowCustomKeyModal(false)}
        onKeysChanged={(keys) => {
          // Why: the modal already persisted this list; bumping the sequence
          // discards refreshes that read storage before its save landed.
          customKeysWriteSeqRef.current += 1
          setCustomKeys(keys)
        }}
      />
    </>
  )
}

const styles = {
  groupHeading: cn('text-xs font-semibold text-muted-foreground tracking-wide mb-1 px-1'),
  groupTopGap: cn('mt-6'),
  section: cn('overflow-hidden rounded-2xl'),
  sectionTopGap: cn('mt-2'),
  row: cn('flex-row items-center gap-2 py-3 px-3'),
  rowPressedActive: cn('active:bg-accent'),
  // Why: rows inside DragReorderList get a fixed height and a trailing grip
  // handle from the list itself, so content only pads on the left.
  reorderRowContent: cn('flex-1 h-full flex-row items-center gap-2 pl-3'),
  rowContent: cn('flex-1'),
  rowLabel: cn('text-sm font-medium text-foreground'),
  rowSublabel: cn('text-xs text-muted-foreground mt-1'),
  keycap: cn('min-w-16 items-center rounded-lg bg-secondary px-2 py-1'),
  keycapText: cn('text-muted-foreground text-xs font-mono')
} as const
