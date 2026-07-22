import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'

import { CaretLeft as ChevronLeft, Copy, Check } from '@/components/uniwind-icons'
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
  const router = useRouter()

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
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Connection log</Text>
      </View>

      {hosts.length > 1 && (
        <View className={styles.hostPicker}>
          {hosts.map((host) => (
            <Pressable
              key={host.id}
              className={cn(styles.hostChip, host.id === selectedId && styles.hostChipActive)}
              onPress={() => setSelectedId(host.id)}
            >
              <Text
                className={cn(
                  styles.hostChipText,
                  host.id === selectedId && styles.hostChipTextActive
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
          <View className={styles.statusRow}>
            <Text className={styles.statusText}>
              {state}
              {reconnectAttempts > 0 ? ` · attempt ${reconnectAttempts}` : ''}
            </Text>
            <Pressable className={styles.copyButton} onPress={() => void copyDiagnostics()}>
              {copied ? (
                <Check size={14} colorClassName="accent-green-500" />
              ) : (
                <Copy size={14} colorClassName="accent-muted-foreground" />
              )}
              <Text className={styles.copyButtonText}>
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
  container: cn('flex-1 bg-background p-4'),
  topRow: cn('flex-row items-center mb-4'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  hostPicker: cn('flex-row flex-wrap gap-2 mb-3'),
  hostChip: cn('py-1.5 px-3 rounded-none bg-secondary'),
  hostChipActive: cn('bg-card border border-border'),
  hostChipText: cn('text-[12px] text-muted-foreground max-w-40'),
  hostChipTextActive: cn('text-foreground font-semibold'),
  statusRow: cn('flex-row items-center justify-between mb-2'),
  statusText: cn('text-[12px] text-muted-foreground'),
  copyButton: cn('flex-row items-center gap-1.5 py-1.5 px-3 rounded-none bg-secondary'),
  copyButtonText: cn('text-[12px] font-semibold text-foreground'),
  emptyText: cn('text-[12px] text-muted-foreground/60 leading-[18px]')
} as const
