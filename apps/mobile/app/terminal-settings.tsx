import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Switch } from 'react-native'
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue
} from 'react-native-reanimated'

import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  DeviceMobile as Smartphone,
  TextT as Type
} from '@/components/uniwind-icons'
import { GestureHandlerRootView } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import { TerminalShortcutSettings } from '../src/components/terminal-shortcut-settings'
import {
  loadTerminalAutocompleteEnabled,
  loadTerminalTextScale,
  saveTerminalAutocompleteEnabled,
  saveTerminalTextScale
} from '../src/storage/preferences'
import { setTerminalAutoRestoreFitMsForHost } from '../src/terminal/terminal-auto-restore-fit-state'
import { useAllHostClients } from '../src/transport/client-context'
import { loadHosts } from '../src/transport/host-store'
import type { RpcClient } from '../src/transport/rpc-client'
import type { HostProfile } from '../src/transport/types'

type RestoreValue = 'indefinite' | '60s' | '5m' | '30m'

type TextSizeValue = 'smallest' | 'smaller' | 'default' | 'large' | 'larger' | 'largest'

// scale = baseline zoom the terminal WebView applies on top of fit-to-width.
// Keep in sync with TERMINAL_TEXT_SCALES; pinch-to-zoom snaps to these values.
const TEXT_SIZE_OPTIONS: (PickerOption<TextSizeValue> & { scale: number })[] = [
  { value: 'smallest', label: 'Smallest (50%)', scale: 0.5 },
  { value: 'smaller', label: 'Smaller (75%)', scale: 0.75 },
  { value: 'default', label: 'Default (100%)', scale: 1 },
  { value: 'large', label: 'Large (125%)', scale: 1.25 },
  { value: 'larger', label: 'Larger (150%)', scale: 1.5 },
  { value: 'largest', label: 'Largest (200%)', scale: 2 }
]

function textSizeValueFromScale(scale: number): TextSizeValue {
  return TEXT_SIZE_OPTIONS.find((o) => o.scale === scale)?.value ?? 'default'
}

function textSizeSummary(scale: number): string {
  return (TEXT_SIZE_OPTIONS.find((o) => o.scale === scale) ?? TEXT_SIZE_OPTIONS[0]!).label
}

const AUTO_RESTORE_FIT_OPTIONS: (PickerOption<RestoreValue> & { ms: number | null })[] = [
  { value: 'indefinite', label: 'Keep at phone size (default)', ms: null },
  { value: '60s', label: 'After 1 minute', ms: 60_000 },
  { value: '5m', label: 'After 5 minutes', ms: 5 * 60_000 },
  { value: '30m', label: 'After 30 minutes', ms: 30 * 60_000 }
]

function valueFromMs(ms: number | null | undefined): RestoreValue {
  if (ms == null) {
    return 'indefinite'
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.ms === ms)
  if (exact) {
    return exact.value
  }
  // Why: server may return a non-preset ms (custom value, future preset,
  // or server-side clamp). Snap to the closest finite preset so the
  // picker's selected radio agrees with the row sublabel rendered by
  // autoRestoreSummary ("After Xs").
  let closest: (typeof AUTO_RESTORE_FIT_OPTIONS)[number] | null = null
  let bestDelta = Infinity
  for (const opt of AUTO_RESTORE_FIT_OPTIONS) {
    if (opt.ms == null) {
      continue
    }
    const delta = Math.abs(opt.ms - ms)
    if (delta < bestDelta) {
      bestDelta = delta
      closest = opt
    }
  }
  return closest ? closest.value : 'indefinite'
}

function autoRestoreSummary(ms: number | null | undefined): string {
  if (ms === undefined) {
    return '…'
  }
  if (ms === null) {
    return AUTO_RESTORE_FIT_OPTIONS[0]!.label
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.ms === ms)
  return exact ? exact.label : `After ${Math.round(ms / 1000)}s`
}

function HostFitRow({
  client,
  hostName,
  ms,
  onPress
}: {
  client: RpcClient | null
  hostName: string
  ms: number | null | undefined
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      className={cn(styles.row, styles.rowPressedActive)}
      onPress={onPress}
      disabled={!client}
    >
      <Smartphone size={16} colorClassName="accent-muted-foreground" />
      <View className={styles.rowContent}>
        <Text className={styles.rowLabel}>{hostName}</Text>
        <Text className={styles.rowSublabel}>{autoRestoreSummary(ms)}</Text>
      </View>
      <ChevronRight size={16} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}

export default function TerminalSettingsScreen() {
  const router = useRouter()

  const [hosts, setHosts] = useState<HostProfile[]>([])
  useEffect(() => {
    void loadHosts().then(setHosts)
  }, [])
  const hostIds = useMemo(() => hosts.map((h) => h.id), [hosts])
  const hostClients = useAllHostClients(hostIds)
  const hostClientsById = useMemo(
    () => new Map(hostClients.map((entry) => [entry.hostId, entry.client])),
    [hostClients]
  )

  // Why: per-host current value, lazily fetched. We keep state at the
  // screen level rather than per-row so the picker can render at root
  // level — embedding PickerModal inside a row clipped its BottomDrawer
  // absoluteFill backdrop to the ScrollView content frame and made the
  // drawer appear cut-off.
  const [hostMs, setHostMs] = useState<Record<string, number | null | undefined>>({})
  const [pickerHostId, setPickerHostId] = useState<string | null>(null)

  const [textScale, setTextScale] = useState(1)
  const [textSizePickerOpen, setTextSizePickerOpen] = useState(false)
  useEffect(() => {
    void loadTerminalTextScale().then(setTextScale)
  }, [])
  const selectTextSize = useCallback((value: TextSizeValue) => {
    const opt = TEXT_SIZE_OPTIONS.find((o) => o.value === value)
    if (!opt) {
      return
    }
    setTextScale(opt.scale)
    void saveTerminalTextScale(opt.scale)
  }, [])

  const [autocompleteEnabled, setAutocompleteEnabled] = useState(false)
  // Why: a fast toggle before the initial load resolves must win — otherwise the
  // delayed read would clobber the user's choice with the stored (stale) value.
  const userToggledAutocompleteRef = useRef(false)
  useEffect(() => {
    let stale = false
    void loadTerminalAutocompleteEnabled().then((enabled) => {
      if (!stale && !userToggledAutocompleteRef.current) {
        setAutocompleteEnabled(enabled)
      }
    })
    return () => {
      stale = true
    }
  }, [])
  const toggleAutocomplete = useCallback((next: boolean) => {
    userToggledAutocompleteRef.current = true
    setAutocompleteEnabled(next)
    void saveTerminalAutocompleteEnabled(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    for (const host of hosts) {
      const client = hostClientsById.get(host.id) ?? null
      if (!client) {
        continue
      }
      void client
        .sendRequest('terminal.getAutoRestoreFit')
        .then((resp) => {
          if (cancelled) {
            return
          }
          const value = (resp as { ms?: number | null } | null)?.ms
          // Why: reconnect/status ticks can replay the same value; preserving
          // object identity avoids rerendering every settings row again.
          setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, host.id, value))
        })
        .catch(() => {
          if (!cancelled) {
            setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, host.id, null))
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [hosts, hostClientsById])

  async function selectValue(hostId: string, value: RestoreValue) {
    const client = hostClientsById.get(hostId) ?? null
    if (!client) {
      return
    }
    const opt = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.value === value)
    if (!opt) {
      return
    }
    setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, opt.ms))
    try {
      const resp = (await client.sendRequest('terminal.setAutoRestoreFit', {
        ms: opt.ms
      })) as { ms?: number | null } | null
      setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, resp?.ms))
    } catch {
      try {
        const resp = (await client.sendRequest('terminal.getAutoRestoreFit')) as {
          ms?: number | null
        } | null
        setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, resp?.ms))
      } catch {
        // give up silently — the next mount retries
      }
    }
  }

  const pickerHost = pickerHostId ? hosts.find((h) => h.id === pickerHostId) : null

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffsetY = useSharedValue(0)
  const scrollContentHeight = useSharedValue(0)
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffsetY.value = event.contentOffset.y
  })
  // Why: imperative toggle instead of state — a re-render while a drag gesture
  // is active would rebuild the row gestures and could cancel the drag.
  const setScrollEnabled = useCallback(
    (enabled: boolean) => {
      scrollRef.current?.setNativeProps({ scrollEnabled: enabled })
    },
    [scrollRef]
  )
  const handleDragActiveChange = useCallback(
    (active: boolean) => setScrollEnabled(!active),
    [setScrollEnabled]
  )

  return (
    <GestureHandlerRootView className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Terminal</Text>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerClassName={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onContentSizeChange={(_width, height) => {
          scrollContentHeight.value = height
        }}
      >
        <Text className={styles.groupHeading}>WHEN YOU LEAVE THE APP</Text>
        <Text className={styles.groupDescription}>
          While you&apos;re using a terminal on your phone, Yiru shrinks it to fit your screen. When
          you close the app or switch away, this controls whether it stays at phone size (so
          interactive CLI tools don&apos;t reflow) or resizes back to your desktop. You can always
          use Restore this terminal or Restore all terminals on the banner to resize manually.
        </Text>

        {hosts.length === 0 ? (
          <View className={cn(styles.section, styles.sectionTopGap)}>
            <Text className={styles.emptyText}>
              No paired desktops yet. Pair one to control terminal behavior.
            </Text>
          </View>
        ) : (
          <View className={cn(styles.section, styles.sectionTopGap)}>
            {hosts.map((host, idx) => {
              const client = hostClientsById.get(host.id) ?? null
              return (
                <View key={host.id}>
                  {idx > 0 && <View className={styles.separator} />}
                  <HostFitRow
                    client={client}
                    hostName={host.name}
                    ms={hostMs[host.id]}
                    onPress={() => setPickerHostId(host.id)}
                  />
                </View>
              )
            })}
          </View>
        )}

        <Text className={cn(styles.groupHeading, styles.inputGroupGap)}>TEXT SIZE</Text>
        <Text className={styles.groupDescription}>
          Scale the terminal text. Smaller sizes fit more columns with side margins; larger sizes
          show fewer columns — drag sideways to pan. You can also pinch to zoom in the terminal
          itself, which updates this setting. Per-device display only; doesn&apos;t change the
          desktop terminal.
        </Text>
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <Pressable
            className={cn(styles.row, styles.rowPressedActive)}
            onPress={() => setTextSizePickerOpen(true)}
          >
            <Type size={16} colorClassName="accent-muted-foreground" />
            <View className={styles.rowContent}>
              <Text className={styles.rowLabel}>Text size</Text>
              <Text className={styles.rowSublabel}>{textSizeSummary(textScale)}</Text>
            </View>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>

        <Text className={cn(styles.groupHeading, styles.inputGroupGap)}>KEYBOARD INPUT</Text>
        <Text className={styles.groupDescription}>
          Enable phone-style autocomplete, autocorrect, and spelling suggestions in the terminal
          command bar. Off by default so the keyboard never rewrites commands, flags, or paths.
          Direct keyboard input (when keys go straight to the terminal) always sends raw keystrokes,
          so suggestions don&apos;t apply there.
        </Text>
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <View className={styles.row}>
            <View className={styles.rowContent}>
              <Text className={styles.rowLabel}>Autocomplete &amp; autocorrect</Text>
              <Text className={styles.rowSublabel}>{autocompleteEnabled ? 'On' : 'Off'}</Text>
            </View>
            <Switch
              value={autocompleteEnabled}
              onValueChange={toggleAutocomplete}
              trackColorOffClassName="accent-accent"
              trackColorOnClassName="accent-muted-foreground"
              thumbColorClassName="accent-foreground"
              ios_backgroundColorClassName="accent-accent"
            />
          </View>
        </View>

        <TerminalShortcutSettings
          scrollRef={scrollRef}
          scrollOffsetY={scrollOffsetY}
          scrollContentHeight={scrollContentHeight}
          onDragActiveChange={handleDragActiveChange}
        />
      </Animated.ScrollView>

      <PickerModal<RestoreValue>
        visible={pickerHost != null}
        title={pickerHost ? `Restore ${pickerHost.name}` : ''}
        options={AUTO_RESTORE_FIT_OPTIONS}
        selected={valueFromMs(pickerHost ? hostMs[pickerHost.id] : null)}
        onSelect={(v) => {
          if (pickerHost) {
            void selectValue(pickerHost.id, v)
          }
        }}
        onClose={() => setPickerHostId(null)}
      />

      <PickerModal<TextSizeValue>
        visible={textSizePickerOpen}
        title="Terminal text size"
        options={TEXT_SIZE_OPTIONS}
        selected={textSizeValueFromScale(textScale)}
        onSelect={selectTextSize}
        onClose={() => setTextSizePickerOpen(false)}
      />
    </GestureHandlerRootView>
  )
}

const styles = {
  container: cn('flex-1 bg-background px-4 pt-0'),
  topRow: cn('flex-row items-center mt-2 mb-4'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  scrollContent: cn('pb-6'),
  groupHeading: cn('text-[11px] font-semibold text-muted-foreground/60 tracking-[0.5px] mb-1 px-1'),
  groupDescription: cn('text-[13px] text-muted-foreground leading-[20px] px-1'),
  section: cn('bg-card rounded-none overflow-hidden'),
  sectionTopGap: cn('mt-2'),
  inputGroupGap: cn('mt-6'),
  emptyText: cn('text-[14px] text-muted-foreground p-3'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowContent: cn('flex-1'),
  rowLabel: cn('text-[14px] font-medium text-foreground'),
  rowSublabel: cn('text-[12px] text-muted-foreground mt-[2px]'),
  separator: cn('h-hairline bg-border mx-3')
} as const
