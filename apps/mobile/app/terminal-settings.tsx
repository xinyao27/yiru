import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Switch } from 'react-native'
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue
} from 'react-native-reanimated'

import {
  CaretRight as ChevronRight,
  DeviceMobile as Smartphone,
  TextT as Type
} from '@/components/uniwind-icons'
import { GestureHandlerRootView } from '@/components/uniwind-native-components'

import { MobileGlassSection } from '../src/components/glass/section'
import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import { TerminalShortcutSettings } from '../src/components/terminal-shortcut-settings'
import {
  loadTerminalAutocompleteEnabled,
  loadTerminalTextScale,
  saveTerminalAutocompleteEnabled,
  saveTerminalTextScale
} from '../src/storage/preferences'
import { setTerminalAutoRestoreFitMsForHost } from '../src/terminal/auto-restore-fit-state'
import { useAllHostClients } from '../src/transport/all-host-clients'
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
      className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
      onPress={onPress}
      disabled={!client}
    >
      <Smartphone size={16} colorClassName="accent-muted-foreground" />
      <View className="flex-1">
        <Text className="text-foreground text-sm">{hostName}</Text>
        <Text className="text-muted-foreground mt-0.5 text-xs">{autoRestoreSummary(ms)}</Text>
      </View>
      <ChevronRight size={16} colorClassName="accent-muted-foreground" />
    </Pressable>
  )
}

export default function TerminalSettingsScreen() {
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
    <GestureHandlerRootView className="bg-background flex-1 px-4 pt-4">
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerClassName="pb-6"
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onContentSizeChange={(_width, height) => {
          scrollContentHeight.value = height
        }}
      >
        <Text className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide">
          WHEN YOU LEAVE THE APP
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          While you&apos;re using a terminal on your phone, Yiru shrinks it to fit your screen. When
          you close the app or switch away, this controls whether it stays at phone size (so
          interactive CLI tools don&apos;t reflow) or resizes back to your desktop. You can always
          use Restore this terminal or Restore all terminals on the banner to resize manually.
        </Text>

        {hosts.length === 0 ? (
          <MobileGlassSection className="mt-2">
            <Text className="text-muted-foreground p-3 text-sm">
              No paired desktops yet. Pair one to control terminal behavior.
            </Text>
          </MobileGlassSection>
        ) : (
          <MobileGlassSection className="mt-2">
            {hosts.map((host, idx) => {
              const client = hostClientsById.get(host.id) ?? null
              return (
                <View key={host.id}>
                  {idx > 0 && <View className="h-hairline bg-border mx-3" />}
                  <HostFitRow
                    client={client}
                    hostName={host.name}
                    ms={hostMs[host.id]}
                    onPress={() => setPickerHostId(host.id)}
                  />
                </View>
              )
            })}
          </MobileGlassSection>
        )}

        <Text className="text-muted-foreground mt-6 mb-1 px-1 text-xs font-semibold tracking-wide">
          TEXT SIZE
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          Scale the terminal text. Smaller sizes fit more columns with side margins; larger sizes
          show fewer columns — drag sideways to pan. You can also pinch to zoom in the terminal
          itself, which updates this setting. Per-device display only; doesn&apos;t change the
          desktop terminal.
        </Text>
        <MobileGlassSection className="mt-2">
          <Pressable
            className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
            onPress={() => setTextSizePickerOpen(true)}
          >
            <Type size={16} colorClassName="accent-muted-foreground" />
            <View className="flex-1">
              <Text className="text-foreground text-sm">Text size</Text>
              <Text className="text-muted-foreground mt-0.5 text-xs">
                {textSizeSummary(textScale)}
              </Text>
            </View>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </MobileGlassSection>

        <Text className="text-muted-foreground mt-6 mb-1 px-1 text-xs font-semibold tracking-wide">
          KEYBOARD INPUT
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          Enable phone-style autocomplete, autocorrect, and spelling suggestions in the terminal
          command bar. Off by default so the keyboard never rewrites commands, flags, or paths.
          Direct keyboard input (when keys go straight to the terminal) always sends raw keystrokes,
          so suggestions don&apos;t apply there.
        </Text>
        <MobileGlassSection className="mt-2">
          <View className="flex-row items-center gap-2.5 px-3.5 py-3">
            <View className="flex-1">
              <Text className="text-foreground text-sm">Autocomplete &amp; autocorrect</Text>
              <Text className="text-muted-foreground mt-0.5 text-xs">
                {autocompleteEnabled ? 'On' : 'Off'}
              </Text>
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
        </MobileGlassSection>

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
