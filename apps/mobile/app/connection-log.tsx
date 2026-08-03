import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { View, Text, Platform } from 'react-native'

import { ConnectionLog } from '~/components/connection-log'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { Copy, Check } from '~/components/uniwind-icons'
import { buildConnectionDiagnosticsReport } from '~/diagnostics/connection-diagnostics-report'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'
import { useHostClient } from '~/transport/client-context'
import {
  useLastConnectedAt,
  useReconnectAttempt
} from '~/transport/client-context-connection-metrics'
import { connectionLogStore } from '~/transport/connection-log-buffer'
import { loadHosts } from '~/transport/host-store'
import type { ConnectionLogEntry, HostProfile } from '~/transport/types'

// Why: getSnapshot must be referentially stable when there's no data —
// a fresh [] per call would make useSyncExternalStore re-render forever.
const EMPTY_ENTRIES: readonly ConnectionLogEntry[] = []

// Why: reading the log is most needed while a host is failing, so this
// screen also *acquires* the host client — opening it kicks a dial and the
// log fills live instead of showing a stale tail.
export default function ConnectionLogScreen() {
  const [hosts, setHosts] = useState<HostProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let stale = false
    void loadHosts().then((loaded) => {
      if (stale) {
        return
      }
      setHosts(loaded)
      setSelectedId((prev) => prev ?? loaded[0]?.id ?? null)
    })
    return () => {
      stale = true
    }
  }, [])

  const selected = hosts.find((h) => h.id === selectedId) ?? null
  const { state } = useHostClient(selected?.id)
  const reconnectAttempts = useReconnectAttempt(selected?.id)
  const lastConnectedAt = useLastConnectedAt(selected?.id)

  const subscribe = useCallback(
    (listener: () => void) =>
      selectedId ? connectionLogStore.subscribe(selectedId, listener) : () => {},
    [selectedId]
  )
  const getSnapshot = useCallback(
    () => (selectedId ? connectionLogStore.get(selectedId) : EMPTY_ENTRIES),
    [selectedId]
  )
  const entries = useSyncExternalStore(subscribe, getSnapshot)

  const copyDiagnostics = useCallback(async () => {
    if (!selected) {
      return
    }
    const report = buildConnectionDiagnosticsReport({
      hostName: selected.name,
      endpoint: selected.endpoint,
      state,
      reconnectAttempts,
      lastConnectedAt,
      platform: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      entries
    })
    await Clipboard.setStringAsync(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [selected, state, reconnectAttempts, lastConnectedAt, entries])

  return (
    <View className="bg-background flex-1 p-4">
      {hosts.length > 1 && (
        <MobileGlassGroup className="mb-3 flex-row flex-wrap gap-2" spacing={8}>
          {hosts.map((host) => (
            <MobileGlassPressable
              key={host.id}
              className="rounded-full"
              contentClassName="rounded-full px-3 py-2"
              isSelected={host.id === selectedId}
              onPress={() => setSelectedId(host.id)}
            >
              <Text
                className={cn(
                  'text-muted-foreground max-w-40 text-xs',
                  host.id === selectedId && 'text-foreground'
                )}
                numberOfLines={1}
              >
                {host.name}
              </Text>
            </MobileGlassPressable>
          ))}
        </MobileGlassGroup>
      )}

      {selected ? (
        <>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-muted-foreground text-xs">
              {state}
              {reconnectAttempts > 0
                ? translate('mobile.connectionLog.attempt', ' · attempt {{count}}', {
                    count: reconnectAttempts
                  })
                : ''}
            </Text>
            <MobileGlassPressable
              className="rounded-full"
              contentClassName="min-h-8 flex-row items-center gap-2 rounded-full px-3"
              onPress={() => void copyDiagnostics()}
            >
              {copied ? (
                <Check size={16} colorClassName="accent-green-500" />
              ) : (
                <Copy size={16} colorClassName="accent-muted-foreground" />
              )}
              <Text className="text-foreground text-xs">
                {copied
                  ? translate('mobile.connectionLog.copied', 'Copied')
                  : translate('mobile.connectionLog.copyDiagnostics', 'Copy diagnostics')}
              </Text>
            </MobileGlassPressable>
          </View>
          {entries.length > 0 ? (
            <ConnectionLog entries={[...entries]} title={selected.name} />
          ) : (
            <Text className="text-muted-foreground text-xs leading-5">
              {translate(
                'mobile.connectionLog.empty',
                'No connection events yet this session. Events appear as the app dials this host.'
              )}
            </Text>
          )}
        </>
      ) : (
        <Text className="text-muted-foreground text-xs leading-5">
          {translate('mobile.connectionLog.noHosts', 'No paired hosts.')}
        </Text>
      )}
    </View>
  )
}
