import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native'

import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from '../src/components/bottom-drawer'
import { VoiceModelList } from '../src/components/voice-model-list'
import {
  deleteDictationModel,
  downloadDictationModel,
  fetchDictationSetup,
  isModelInFlight,
  setDictationConfig,
  type MobileSpeechModel,
  type MobileSpeechSetup
} from '../src/dictation/mobile-dictation-setup'
import { useAllHostClients } from '../src/transport/client-context'
import { loadHosts } from '../src/transport/host-store'
import type { RpcClient } from '../src/transport/rpc-client'
import type { HostProfile } from '../src/transport/types'

const POLL_INTERVAL_MS = 1500

const DICTATION_MODES = [
  { value: 'toggle', label: 'Toggle' },
  { value: 'hold', label: 'Hold' }
] as const

type ModelBusyAction = { modelId: string; type: 'download' | 'select' | 'delete' }

export default function VoiceSettingsScreen(): React.JSX.Element {
  const router = useRouter()

  const [hosts, setHosts] = useState<HostProfile[]>([])
  useEffect(() => {
    void loadHosts().then(setHosts)
  }, [])
  const hostIds = useMemo(() => hosts.map((h) => h.id), [hosts])
  const hostClients = useAllHostClients(hostIds)
  // Voice dictation runs on the paired desktop, so pick the first connected host.
  const client: RpcClient | null = useMemo(
    () => hostClients.find((entry) => entry.state === 'connected')?.client ?? null,
    [hostClients]
  )

  const [setup, setSetup] = useState<MobileSpeechSetup | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<ModelBusyAction | null>(null)
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!client) {
      return
    }
    try {
      setSetup(await fetchDictationSetup(client))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voice settings')
    }
  }, [client])

  // Initial load once a connected client is available.
  useEffect(() => {
    if (!client) {
      return
    }
    setLoading(true)
    setError(null)
    void refresh().finally(() => setLoading(false))
  }, [client, refresh])

  // Poll only while a model is downloading/extracting; stop otherwise.
  useEffect(() => {
    const inFlight = setup?.models.some(isModelInFlight) ?? false
    if (inFlight && client) {
      pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS)
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }
    return undefined
  }, [setup, client, refresh])

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!client) {
        return
      }
      setError(null)
      // Optimistic flip so the switch responds instantly; reconcile below.
      setSetup((prev) => (prev ? { ...prev, enabled } : prev))
      try {
        setSetup(await setDictationConfig(client, { enabled }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update')
        void refresh()
      }
    },
    [client, refresh]
  )

  const handleSelectMode = useCallback(
    async (dictationMode: 'toggle' | 'hold') => {
      if (!client) {
        return
      }
      setError(null)
      setSetup((prev) => (prev ? { ...prev, dictationMode } : prev))
      try {
        setSetup(await setDictationConfig(client, { dictationMode }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update')
        void refresh()
      }
    },
    [client, refresh]
  )

  const handleUseModel = useCallback(
    async (model: MobileSpeechModel) => {
      if (!client) {
        return
      }
      setBusyAction({ modelId: model.id, type: 'select' })
      setError(null)
      try {
        setSetup(await setDictationConfig(client, { enabled: true, modelId: model.id }))
        setModelDrawerOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not select model')
      } finally {
        setBusyAction(null)
      }
    },
    [client]
  )

  const handleDownload = useCallback(
    async (model: MobileSpeechModel) => {
      if (!client) {
        return
      }
      setBusyAction({ modelId: model.id, type: 'download' })
      setError(null)
      try {
        await downloadDictationModel(client, model.id)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Download failed')
      } finally {
        setBusyAction(null)
      }
    },
    [client, refresh]
  )

  const handleDelete = useCallback(
    async (model: MobileSpeechModel) => {
      if (!client) {
        return
      }
      const deletedSelectedModel = setup?.selectedModelId === model.id
      setBusyAction({ modelId: model.id, type: 'delete' })
      setError(null)
      try {
        setSetup(await deleteDictationModel(client, model.id))
        if (deletedSelectedModel) {
          setModelDrawerOpen(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setBusyAction(null)
      }
    },
    [client, setup?.selectedModelId]
  )

  const enabled = setup?.enabled ?? false
  const selectedModel = setup?.models.find((m) => m.id === setup.selectedModelId)
  const selectedModelLabel = selectedModel?.label ?? 'None selected'

  return (
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Voice</Text>
      </View>

      {!client ? (
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <Text className={styles.emptyText}>Connect to a desktop to manage voice settings.</Text>
        </View>
      ) : loading && setup === null ? (
        <View className={styles.loading}>
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : setup === null ? (
        <View className={cn(styles.section, styles.sectionTopGap)}>
          <Text className={styles.errorText}>{error ?? 'Failed to load voice settings.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text className={styles.groupHeading}>DICTATION</Text>
          <View className={cn(styles.section, styles.sectionTopGap)}>
            <View className={styles.row}>
              <View className={styles.rowContent}>
                <Text className={styles.rowLabel}>Enable Voice Dictation</Text>
                <Text className={styles.rowSublabel}>
                  Dictate text into any focused pane on your desktop.
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(v) => void handleToggleEnabled(v)}
                trackColorOffClassName="accent-secondary"
                trackColorOnClassName="accent-muted-foreground"
                thumbColorClassName="accent-foreground"
                ios_backgroundColorClassName="accent-secondary"
              />
            </View>

            <View className={styles.separator} />

            <View
              className={cn(styles.row, !enabled && styles.disabled)}
              pointerEvents={enabled ? 'auto' : 'none'}
            >
              <View className={styles.rowContent}>
                <Text className={styles.rowLabel}>Dictation Mode</Text>
                <Text className={styles.rowSublabel}>
                  Toggle: press once to start, again to stop. Hold: dictate while held.
                </Text>
              </View>
              <View className={styles.segmented}>
                {DICTATION_MODES.map((mode) => {
                  const active = setup.dictationMode === mode.value
                  return (
                    <Pressable
                      key={mode.value}
                      onPress={() => void handleSelectMode(mode.value)}
                      className={cn(styles.segment, active && styles.segmentActive)}
                    >
                      <Text className={cn(styles.segmentText, active && styles.segmentTextActive)}>
                        {mode.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </View>

          <Text className={cn(styles.groupHeading, styles.inputGroupGap)}>SPEECH MODEL</Text>
          <View className={cn(styles.section, styles.sectionTopGap)}>
            <Pressable
              className={cn(styles.row, !enabled && styles.disabled, styles.rowPressedActive)}
              disabled={!enabled}
              onPress={() => setModelDrawerOpen(true)}
            >
              <View className={styles.rowContent}>
                <Text className={styles.rowLabel}>Speech Model</Text>
                <Text className={styles.rowSublabel} numberOfLines={1}>
                  {selectedModelLabel}
                </Text>
              </View>
              <ChevronRight size={18} colorClassName="accent-muted-foreground" />
            </Pressable>
          </View>

          {error ? <Text className={styles.error}>{error}</Text> : null}
        </ScrollView>
      )}

      <BottomDrawer visible={modelDrawerOpen} onClose={() => setModelDrawerOpen(false)}>
        <Text className={styles.drawerTitle}>Speech Model</Text>
        {setup ? (
          <VoiceModelList
            setup={setup}
            disabled={false}
            busyAction={busyAction}
            onUseModel={(m) => void handleUseModel(m)}
            onDownload={(m) => void handleDownload(m)}
            onDelete={(m) => void handleDelete(m)}
          />
        ) : null}
      </BottomDrawer>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background px-4'),
  topRow: cn('flex-row items-center mt-2 mb-4'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  scrollContent: cn('pb-6'),
  loading: cn('py-6 items-center'),
  groupHeading: cn('text-[11px] font-semibold text-muted-foreground/60 tracking-[0.5px] mb-1 px-1'),
  section: cn('bg-card rounded-none overflow-hidden'),
  sectionTopGap: cn('mt-2'),
  inputGroupGap: cn('mt-6'),
  disabled: cn('opacity-[0.5]'),
  emptyText: cn('text-[14px] text-muted-foreground p-3'),
  errorText: cn('text-[14px] text-destructive p-3'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowContent: cn('flex-1'),
  rowLabel: cn('text-[14px] font-medium text-foreground'),
  drawerTitle: cn('text-[14px] font-bold text-foreground px-3.5 pt-2 pb-1'),
  rowSublabel: cn('text-[12px] text-muted-foreground mt-[2px]'),
  separator: cn('h-hairline bg-border mx-3'),
  segmented: cn('flex-row items-center bg-background rounded-none p-[2px]'),
  segment: cn('px-3 py-1.5 rounded-none'),
  segmentActive: cn('bg-secondary'),
  segmentText: cn('text-[12px] text-muted-foreground font-semibold'),
  segmentTextActive: cn('text-foreground'),
  error: cn('text-destructive text-[12px] mt-3')
} as const
