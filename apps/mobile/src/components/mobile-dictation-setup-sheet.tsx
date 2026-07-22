import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native'

import { Check, Download } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  downloadDictationModel,
  fetchDictationSetup,
  isModelInFlight,
  setDictationConfig,
  type MobileSpeechModel,
  type MobileSpeechSetup
} from '../dictation/mobile-dictation-setup'
import { triggerError, triggerSuccess } from '../platform/haptics'
import type { RpcClient } from '../transport/rpc-client'
import { BottomDrawer } from './bottom-drawer'

const POLL_INTERVAL_MS = 1500

type Props = {
  visible: boolean
  client: RpcClient | null
  onClose: () => void
  // Called after the user reaches a ready+enabled state, so the caller can retry.
  onReady?: () => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) {
    return ''
  }
  return `${Math.round(bytes / 1_000_000)} MB`
}

// Lets the user enable dictation and download a speech model on the paired
// desktop, from the phone. Polls while a download is in flight.
export function MobileDictationSetupSheet({ visible, client, onClose, onReady }: Props) {
  const [setup, setSetup] = useState<MobileSpeechSetup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!client) {
      return
    }
    try {
      setSetup(await fetchDictationSetup(client))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [client])

  useEffect(() => {
    if (visible) {
      setError(null)
      void refresh()
    }
  }, [visible, refresh])

  // Poll only while something is downloading/extracting; stop otherwise.
  useEffect(() => {
    const inFlight = setup?.models.some(isModelInFlight) ?? false
    if (visible && inFlight && client) {
      pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS)
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }
    return undefined
  }, [visible, setup, client, refresh])

  const handleDownload = useCallback(
    async (model: MobileSpeechModel) => {
      if (!client) {
        return
      }
      setBusy(model.id)
      setError(null)
      try {
        await downloadDictationModel(client, model.id)
        await refresh()
      } catch (err) {
        triggerError()
        setError(err instanceof Error ? err.message : 'Download failed')
      } finally {
        setBusy(null)
      }
    },
    [client, refresh]
  )

  const handleUseModel = useCallback(
    async (model: MobileSpeechModel) => {
      if (!client) {
        return
      }
      setBusy(model.id)
      setError(null)
      try {
        const next = await setDictationConfig(client, { enabled: true, modelId: model.id })
        setSetup(next)
        triggerSuccess()
        onReady?.()
      } catch (err) {
        triggerError()
        setError(err instanceof Error ? err.message : 'Could not select model')
      } finally {
        setBusy(null)
      }
    },
    [client, onReady]
  )

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!client) {
        return
      }
      setError(null)
      try {
        setSetup(await setDictationConfig(client, { enabled }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update')
      }
    },
    [client]
  )

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      {/* Why: BottomDrawer already scrolls its children in a keyboard-aware container;
          a nested capped ScrollView cut off the lower controls. */}
      <View>
        <Text className={styles.heading}>Set up voice dictation</Text>
        <Text className={styles.subtitle}>
          Download a model and enable dictation on your desktop — all from here.
        </Text>

        {setup === null ? (
          <View className={styles.loading}>
            <ActivityIndicator colorClassName="accent-muted-foreground" />
          </View>
        ) : (
          <>
            <View className={styles.enableRow}>
              <Text className={styles.enableLabel}>Dictation enabled</Text>
              <Switch
                value={setup.enabled}
                onValueChange={(v) => void handleToggleEnabled(v)}
                trackColorOffClassName="accent-secondary"
                trackColorOnClassName="accent-muted-foreground"
                thumbColorClassName="accent-foreground"
                ios_backgroundColorClassName="accent-secondary"
              />
            </View>

            {setup.models.map((model) => {
              const isSelected = model.id === setup.selectedModelId
              const inFlight = isModelInFlight(model)
              const rowBusy = busy === model.id
              return (
                <View key={model.id} className={styles.modelRow}>
                  <View className={styles.modelInfo}>
                    <View className={styles.modelTitleRow}>
                      <Text className={styles.modelLabel}>{model.label}</Text>
                      {model.recommended ? (
                        <Text className={styles.recommended}>Recommended</Text>
                      ) : null}
                    </View>
                    <Text className={styles.modelMeta}>
                      {model.provider === 'openai' ? 'OpenAI API' : formatSize(model.sizeBytes)}
                      {inFlight && model.progress != null
                        ? ` · ${Math.round(model.progress * 100)}%`
                        : model.status === 'extracting'
                          ? ' · extracting…'
                          : ''}
                    </Text>
                  </View>
                  {model.provider === 'openai' ? (
                    <Text className={styles.modelStateText}>
                      {model.status === 'ready' ? 'API key set' : 'Set up on desktop'}
                    </Text>
                  ) : model.status === 'ready' ? (
                    isSelected ? (
                      <View className={styles.selectedTag}>
                        <Check size={14} colorClassName="accent-green-500" />
                        <Text className={styles.selectedText}>In use</Text>
                      </View>
                    ) : (
                      <Pressable
                        className={cn(styles.actionButton, styles.actionPressedActive)}
                        disabled={rowBusy}
                        onPress={() => void handleUseModel(model)}
                      >
                        <Text className={styles.actionText}>Use</Text>
                      </Pressable>
                    )
                  ) : inFlight ? (
                    <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                  ) : (
                    <Pressable
                      className={cn(styles.actionButton, styles.actionPressedActive)}
                      disabled={rowBusy}
                      onPress={() => void handleDownload(model)}
                    >
                      {rowBusy ? (
                        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                      ) : (
                        <>
                          <Download size={13} colorClassName="accent-muted-foreground" />
                          <Text className={styles.actionText}>Download</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              )
            })}
          </>
        )}
        {error ? <Text className={styles.error}>{error}</Text> : null}
      </View>
    </BottomDrawer>
  )
}

const styles = {
  heading: cn('text-foreground text-[14px] font-bold'),
  subtitle: cn('text-muted-foreground text-[12px] mt-1 mb-3'),
  loading: cn('py-6 items-center'),
  enableRow: cn('flex-row items-center justify-between py-2 border-b border-b-border mb-2'),
  enableLabel: cn('text-foreground text-[14px]'),
  modelRow: cn('flex-row items-center justify-between gap-3 py-2'),
  modelInfo: cn('flex-1 min-w-0'),
  modelTitleRow: cn('flex-row items-center gap-2'),
  modelLabel: cn('text-foreground text-[14px]'),
  recommended: cn('text-green-500 text-[10px] font-bold'),
  modelMeta: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  modelStateText: cn('text-muted-foreground/60 text-[12px]'),
  actionButton: cn('flex-row items-center gap-[5px] px-3 py-1.5 rounded-none bg-secondary'),
  actionPressedActive: cn('active:opacity-[0.7]'),
  actionText: cn('text-muted-foreground text-[12px] font-semibold'),
  selectedTag: cn('flex-row items-center gap-1'),
  selectedText: cn('text-green-500 text-[12px] font-semibold'),
  error: cn('text-destructive text-[12px] mt-3')
} as const
