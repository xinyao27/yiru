import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue
} from 'react-native-reanimated'

import { MobileContentSection } from '~/components/content-section'
import { SelectionDrawer } from '~/components/selection-drawer'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import {
  CaretRight as ChevronRight,
  DeviceMobile as Smartphone,
  TextT as Type
} from '~/components/uniwind-icons'
import { GestureHandlerRootView } from '~/components/uniwind-native-components'
import { translate } from '~/i18n/translate'
import {
  loadTerminalAutocompleteEnabled,
  loadTerminalTextScale,
  saveTerminalAutocompleteEnabled,
  saveTerminalTextScale
} from '~/storage/preferences'
import { setTerminalAutoRestoreFitMsForHost } from '~/terminal/auto-restore-fit-state'
import {
  AUTO_RESTORE_FIT_OPTIONS,
  autoRestoreSummary,
  type RestoreValue,
  TEXT_SIZE_OPTIONS,
  textSizeSummary,
  textSizeValueFromScale,
  type TextSizeValue,
  valueFromMs
} from '~/terminal/settings-options'
import { TerminalShortcutSettings } from '~/terminal/shortcut-settings'
import { useAllHostClients } from '~/transport/all-host-clients'
import { loadHosts } from '~/transport/host-store'
import type { RpcClient } from '~/transport/rpc-client'
import type { HostProfile } from '~/transport/types'

// Why: sendRequest resolves with the raw RpcResponse envelope and never throws
// on {ok:false}, so the ms payload must be read out of `result` — reading it off
// the envelope always yields undefined and silently falls back to the default.
function autoRestoreFitMsFromResult(result: unknown): number | null | undefined {
  return (result as { ms?: number | null } | null)?.ms
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
      className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
      onPress={onPress}
      disabled={!client}
    >
      <View className="w-5 items-center">
        <Smartphone size={16} colorClassName="accent-muted-foreground" />
      </View>
      <View className="flex-1">
        <Text className="text-foreground text-sm">{hostName}</Text>
        <Text className="text-muted-foreground mt-1 text-xs">{autoRestoreSummary(ms)}</Text>
      </View>
      <View className="w-5 items-center">
        <ChevronRight size={16} colorClassName="accent-muted-foreground" />
      </View>
    </Pressable>
  )
}

export default function TerminalSettingsScreen(): React.JSX.Element {
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
  // level — embedding SelectionDrawer inside a row clipped its BottomDrawer
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
          // Why: a rejected read must fall back to the default the same way a
          // transport rejection does — {ok:false} never reaches the catch below.
          const value = resp.ok ? autoRestoreFitMsFromResult(resp.result) : null
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
    const previousMs = hostMs[hostId]
    setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, opt.ms))
    try {
      const resp = await client.sendRequest('terminal.setAutoRestoreFit', { ms: opt.ms })
      if (resp.ok) {
        setHostMs((prev) =>
          setTerminalAutoRestoreFitMsForHost(prev, hostId, autoRestoreFitMsFromResult(resp.result))
        )
        return
      }
    } catch {
      // fall through to the re-read below
    }
    // Why: the write was rejected (or the transport failed), so re-read the
    // authoritative value; if that fails too, restore what was on screen rather
    // than leaving the optimistic value the host never accepted.
    try {
      const resp = await client.sendRequest('terminal.getAutoRestoreFit')
      setHostMs((prev) =>
        setTerminalAutoRestoreFitMsForHost(
          prev,
          hostId,
          resp.ok ? autoRestoreFitMsFromResult(resp.result) : previousMs
        )
      )
    } catch {
      setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, previousMs))
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
          {translate('mobile.terminalSettings.autoRestore.heading', 'WHEN YOU LEAVE THE APP')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.terminalSettings.autoRestore.description',
            "While you're using a terminal on your phone, Yiru shrinks it to fit your screen. When you close the app or switch away, this controls whether it stays at phone size (so interactive CLI tools don't reflow) or resizes back to your desktop. You can always use Restore this terminal or Restore all terminals on the banner to resize manually."
          )}
        </Text>

        {hosts.length === 0 ? (
          <MobileContentSection className="mt-2">
            <Text className="text-muted-foreground p-3 text-sm">
              {translate(
                'mobile.terminalSettings.autoRestore.noHosts',
                'No paired desktops yet. Pair one to control terminal behavior.'
              )}
            </Text>
          </MobileContentSection>
        ) : (
          <MobileContentSection className="mt-2">
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
          </MobileContentSection>
        )}

        <Text className="text-muted-foreground mt-6 mb-1 px-1 text-xs font-semibold tracking-wide">
          {translate('mobile.terminalSettings.textSize.heading', 'TEXT SIZE')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.terminalSettings.textSize.description',
            "Scale the terminal text. Smaller sizes fit more columns with side margins; larger sizes show fewer columns — drag sideways to pan. You can also pinch to zoom in the terminal itself, which updates this setting. Per-device display only; doesn't change the desktop terminal."
          )}
        </Text>
        <MobileContentSection className="mt-2">
          <Pressable
            accessibilityLabel={translate('mobile.terminalSettings.textSize.label', 'Text size')}
            accessibilityRole="button"
            className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
            onPress={() => setTextSizePickerOpen(true)}
          >
            <View className="w-5 items-center">
              <Type size={16} colorClassName="accent-muted-foreground" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm">
                {translate('mobile.terminalSettings.textSize.label', 'Text size')}
              </Text>
              <Text className="text-muted-foreground mt-1 text-xs">
                {textSizeSummary(textScale)}
              </Text>
            </View>
            <View className="w-5 items-center">
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </View>
          </Pressable>
        </MobileContentSection>

        <Text className="text-muted-foreground mt-6 mb-1 px-1 text-xs font-semibold tracking-wide">
          {translate('mobile.terminalSettings.keyboard.heading', 'KEYBOARD INPUT')}
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          {translate(
            'mobile.terminalSettings.keyboard.description',
            "Enable phone-style autocomplete, autocorrect, and spelling suggestions in the terminal command bar. Off by default so the keyboard never rewrites commands, flags, or paths. Direct keyboard input (when keys go straight to the terminal) always sends raw keystrokes, so suggestions don't apply there."
          )}
        </Text>
        <MobileContentSection className="mt-2">
          <SettingsToggleRow
            label={translate(
              'mobile.terminalSettings.autocomplete.label',
              'Autocomplete & autocorrect'
            )}
            onValueChange={toggleAutocomplete}
            value={autocompleteEnabled}
          />
        </MobileContentSection>

        <TerminalShortcutSettings
          scrollRef={scrollRef}
          scrollOffsetY={scrollOffsetY}
          scrollContentHeight={scrollContentHeight}
          onDragActiveChange={handleDragActiveChange}
        />
      </Animated.ScrollView>

      <SelectionDrawer<RestoreValue, RestoreValue>
        visible={pickerHost != null}
        title={
          pickerHost
            ? translate('mobile.terminalSettings.autoRestore.pickerTitle', 'Restore {{host}}', {
                host: pickerHost.name
              })
            : ''
        }
        options={AUTO_RESTORE_FIT_OPTIONS}
        selectedId={valueFromMs(pickerHost ? hostMs[pickerHost.id] : null)}
        onSelect={(v) => {
          if (pickerHost) {
            void selectValue(pickerHost.id, v)
          }
        }}
        onClose={() => setPickerHostId(null)}
      />

      <SelectionDrawer<TextSizeValue, TextSizeValue>
        visible={textSizePickerOpen}
        title={translate('mobile.terminalSettings.textSize.pickerTitle', 'Terminal text size')}
        options={TEXT_SIZE_OPTIONS}
        selectedId={textSizeValueFromScale(textScale)}
        onSelect={selectTextSize}
        onClose={() => setTextSizePickerOpen(false)}
      />
    </GestureHandlerRootView>
  )
}
