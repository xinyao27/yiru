import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'

import { Copy, Check } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { ConnectionLog } from '../src/components/connection-log'
import { buildConnectionDiagnosticsReport } from '../src/diagnostics/connection-diagnostics-report'
import { useHostClient } from '../src/transport/client-context'
import {
  useLastConnectedAt,
  useReconnectAttempt
} from '../src/transport/client-context-connection-metrics'
import { connectionLogStore } from '../src/transport/connection-log-buffer'
import { loadHosts } from '../src/transport/host-store'
import type { ConnectionLogEntry, HostProfile } from '../src/transport/types'

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
        <View className="mb-3 flex-row flex-wrap gap-2">
          {hosts.map((host) => (
            <Pressable
              key={host.id}
              className={cn(
                'rounded-full bg-secondary px-3 py-1.5',
                host.id === selectedId && 'bg-card border border-border'
              )}
              onPress={() => setSelectedId(host.id)}
            >
              <Text
                className={cn(
                  'text-xs text-muted-foreground max-w-40',
                  host.id === selectedId && 'text-foreground font-semibold'
                )}
                numberOfLines={1}
              >
                {host.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {selected ? (
        <>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-muted-foreground text-xs">
              {state}
              {reconnectAttempts > 0 ? ` · attempt ${reconnectAttempts}` : ''}
            </Text>
            <Pressable
              className="bg-secondary flex-row items-center gap-1.5 rounded-xl px-3 py-1.5"
              onPress={() => void copyDiagnostics()}
            >
              {copied ? (
                <Check size={14} colorClassName="accent-green-500" />
              ) : (
                <Copy size={14} colorClassName="accent-muted-foreground" />
              )}
              <Text className="text-foreground text-xs font-semibold">
                {copied ? 'Copied' : 'Copy diagnostics'}
              </Text>
            </Pressable>
          </View>
          {entries.length > 0 ? (
            <ConnectionLog entries={[...entries]} title={selected.name} />
          ) : (
            <Text className={styles.emptyText}>
              No connection events yet this session. Events appear as the app dials this host.
            </Text>
          )}
        </>
      ) : (
        <Text className={styles.emptyText}>No paired hosts.</Text>
      )}
    </View>
  )
}

const styles = {
  emptyText: cn('text-xs text-muted-foreground leading-5')
} as const
