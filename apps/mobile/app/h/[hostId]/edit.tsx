import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native'

import { CaretLeft as ChevronLeft } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { useForceReconnect, usePrimeHosts } from '../../../src/transport/client-context'
import {
  displayHostEndpoint,
  endpointPort,
  endpointScheme,
  normalizeHostEndpoint
} from '../../../src/transport/host-endpoint'
import { loadHosts, updateHostNameAndEndpoint } from '../../../src/transport/host-store'
import type { HostProfile } from '../../../src/transport/types'

export default function EditHostScreen() {
  const router = useRouter()

  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const primeHosts = usePrimeHosts()
  const forceReconnectHost = useForceReconnect()

  const [host, setHost] = useState<HostProfile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Why: setSaving is async, so a second trigger before the re-render could
  // still read stale state and re-enter handleSave; the ref closes that race.
  const savingRef = useRef(false)

  const load = useCallback(async () => {
    if (!hostId) {
      setLoadError('Missing host.')
      return
    }
    try {
      const hosts = await loadHosts()
      const found = hosts.find((h) => h.id === hostId) ?? null
      if (!found) {
        setLoadError('This host was removed from this phone.')
        setHost(null)
        return
      }
      setHost(found)
      setName(found.name)
      setAddress(displayHostEndpoint(found.endpoint))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load host.')
      setHost(null)
    }
  }, [hostId])

  useEffect(() => {
    void load()
  }, [load])

  const fallbackPort = host ? endpointPort(host.endpoint) : undefined
  const fallbackScheme = host ? endpointScheme(host.endpoint) : 'ws'

  const normalizedEndpoint = useMemo(
    () => normalizeHostEndpoint(address, { fallbackPort, fallbackScheme }),
    [address, fallbackPort, fallbackScheme]
  )

  const nameTrimmed = name.trim()
  const nameChanged = host != null && nameTrimmed.length > 0 && nameTrimmed !== host.name
  const endpointChanged =
    host != null && normalizedEndpoint.ok && normalizedEndpoint.endpoint !== host.endpoint
  const canSave =
    host != null &&
    nameTrimmed.length > 0 &&
    normalizedEndpoint.ok &&
    (nameChanged || endpointChanged) &&
    !saving

  async function handleSave() {
    if (!host || !hostId || savingRef.current) {
      return
    }
    const nextName = name.trim()
    if (!nextName) {
      setSaveError('Enter a name.')
      return
    }
    if (!normalizedEndpoint.ok) {
      setSaveError(normalizedEndpoint.error)
      return
    }

    const willRename = nextName !== host.name
    const willUpdateEndpoint = normalizedEndpoint.endpoint !== host.endpoint
    if (!willRename && !willUpdateEndpoint) {
      router.back()
      return
    }

    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      // Why: a single mutateStoredHosts pass so name + endpoint commit
      // atomically — a mid-save failure can never persist one without the
      // other, and a host removed mid-edit throws instead of no-oping.
      await updateHostNameAndEndpoint(host.id, {
        ...(willRename ? { name: nextName } : {}),
        ...(willUpdateEndpoint ? { endpoint: normalizedEndpoint.endpoint } : {})
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save host.')
      savingRef.current = false
      setSaving(false)
      return
    }

    try {
      // Why: the write already committed above; a re-prime failure here
      // must not be reported as a save failure — the next loadHosts() call
      // elsewhere in the app picks up the fresh state regardless.
      const hosts = await loadHosts()
      primeHosts(hosts)
    } catch {
      // best-effort re-prime; persisted data is unaffected
    }

    savingRef.current = false
    setSaving(false)
    router.back()

    if (willUpdateEndpoint) {
      // Why: reconnect is a follow-on side effect of a save that already
      // committed — its failure or a hang must not be reported as a save
      // failure or block navigating back.
      void forceReconnectHost(host.id).catch(() => {})
    }
  }

  return (
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable
          className={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>Edit host</Text>
        <Pressable
          className={cn(
            styles.saveButton,
            !canSave && styles.saveButtonDisabled,
            styles.saveButtonDisabledActive
          )}
          onPress={() => void handleSave()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save host"
        >
          {saving ? (
            <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
          ) : (
            <Text className={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      {loadError ? (
        <View className={styles.errorState}>
          <Text className={styles.errorText}>{loadError}</Text>
          <Pressable className={styles.secondaryButton} onPress={() => router.back()}>
            <Text className={styles.secondaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      ) : !host ? (
        <View className={styles.loadingState}>
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : (
        <KeyboardAvoidingView
          className={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName={cn(styles.form, 'pb-safe-offset-6')}
            keyboardShouldPersistTaps="handled"
          >
            <Text className={styles.help}>
              Change the display name or connection address. Address edits only switch where this
              phone connects — they do not re-pair. Use this when the same desktop is reachable at a
              different IP (for example home LAN vs Tailscale).
            </Text>

            <Text className={styles.label}>Name</Text>
            <TextInput
              className={styles.input}
              accessibilityLabel="Name"
              value={name}
              onChangeText={(value) => {
                setName(value)
                setSaveError(null)
              }}
              placeholder="Host name"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text className={styles.label}>Address</Text>
            <TextInput
              className={styles.input}
              accessibilityLabel="Address"
              value={address}
              onChangeText={(value) => {
                setAddress(value)
                setSaveError(null)
              }}
              placeholder="192.168.1.10:6768"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSave) {
                  void handleSave()
                }
              }}
            />
            <Text className={styles.hint}>
              Accepts IP, host:port, or ws:// / wss://. Missing port defaults to the current port
              (or 6768).
            </Text>

            {normalizedEndpoint.ok ? (
              <Text className={styles.preview} numberOfLines={2}>
                Connects to {normalizedEndpoint.endpoint}
              </Text>
            ) : address.trim().length > 0 ? (
              <Text className={styles.previewError}>{normalizedEndpoint.error}</Text>
            ) : null}

            {saveError ? <Text className={styles.errorText}>{saveError}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background'),
  flex: cn('flex-1'),
  topRow: cn('flex-row items-center px-3 pb-3 gap-2'),
  backButton: cn('w-9 h-9 items-center justify-center'),
  heading: cn('flex-1 text-foreground text-[20px] font-bold'),
  saveButton: cn('min-w-16 h-[34px] px-3 rounded-none bg-primary items-center justify-center'),
  saveButtonDisabled: cn('opacity-[0.4]'),
  saveButtonDisabledActive: cn('active:opacity-[0.4]'),
  saveButtonText: cn('text-primary-foreground text-[14px] font-semibold'),
  form: cn('px-4 gap-2'),
  help: cn('text-muted-foreground text-[14px] leading-[20px] mb-2'),
  label: cn('text-muted-foreground text-[12px] font-medium mt-2 uppercase tracking-[0.4px]'),
  input: cn(
    'bg-card border border-border rounded-none text-foreground text-[14px] px-3 py-2.5 ios:py-3'
  ),
  hint: cn('text-muted-foreground/60 text-[12px] leading-[16px]'),
  preview: cn('mt-2 text-muted-foreground text-[12px] font-mono ios:font-mono'),
  previewError: cn('mt-2 text-destructive text-[14px]'),
  errorText: cn('text-destructive text-[14px] mt-3'),
  errorState: cn('flex-1 px-4 pt-6 gap-3'),
  loadingState: cn('flex-1 items-center justify-center'),
  secondaryButton: cn('self-start px-3 py-2 rounded-none bg-secondary'),
  secondaryButtonText: cn('text-foreground text-[14px] font-medium')
} as const
