import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { useForceReconnect, usePrimeHosts } from '~/transport/client-context'
import {
  displayHostEndpoint,
  endpointPort,
  endpointScheme,
  normalizeHostEndpoint
} from '~/transport/host-endpoint'
import { loadHosts, updateHostNameAndEndpoint } from '~/transport/host-store'
import type { HostProfile } from '~/transport/types'

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
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassTextButton
                    accessibilityLabel="Save host"
                    disabled={!canSave}
                    isProminent
                    label="Save"
                    onPress={() => void handleSave()}
                  />
                )
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Save host"
            disabled={!canSave}
            onPress={() => void handleSave()}
            variant="prominent"
          >
            Save
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      {loadError ? (
        <View className="flex-1 gap-3 px-4 pt-6">
          <Text className="text-destructive mt-3 text-sm">{loadError}</Text>
          <MobileGlassTextButton label="Go back" onPress={() => router.back()} />
        </View>
      ) : !host ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="px-4 gap-2 pb-safe-offset-6"
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-muted-foreground mb-2 text-sm leading-5">
              Change the display name or connection address. Address edits only switch where this
              phone connects — they do not re-pair. Use this when the same desktop is reachable at a
              different IP (for example home LAN vs Tailscale).
            </Text>

            <Text className="text-muted-foreground mt-2 text-xs font-medium tracking-wide uppercase">
              Name
            </Text>
            <MobileGlassSurface className="min-h-11 overflow-hidden rounded-full" isInteractive>
              <TextInput
                className="text-foreground min-h-11 rounded-full px-4 text-sm"
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
            </MobileGlassSurface>

            <Text className="text-muted-foreground mt-2 text-xs font-medium tracking-wide uppercase">
              Address
            </Text>
            <MobileGlassSurface className="min-h-11 overflow-hidden rounded-full" isInteractive>
              <TextInput
                className="text-foreground min-h-11 rounded-full px-4 text-sm"
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
            </MobileGlassSurface>
            <Text className="text-muted-foreground text-xs leading-4">
              Accepts IP, host:port, or ws:// / wss://. Missing port defaults to the current port
              (or 6768).
            </Text>

            {normalizedEndpoint.ok ? (
              <Text
                className="text-muted-foreground ios:font-mono mt-2 font-mono text-xs"
                numberOfLines={2}
              >
                Connects to {normalizedEndpoint.endpoint}
              </Text>
            ) : address.trim().length > 0 ? (
              <Text className="text-destructive mt-2 text-sm">{normalizedEndpoint.error}</Text>
            ) : null}

            {saveError ? <Text className="text-destructive mt-3 text-sm">{saveError}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}
