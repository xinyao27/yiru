import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const RELAY_OVERLAY_STORAGE_KEY = 'yiru:mobile-relay:host-overlays:v2'
const RELAY_PAIRING_JOURNAL_STORAGE_KEY = 'yiru:mobile-relay:pairing-journal:v1'
const RELAY_PAIRING_JOURNAL_SECRET_KEY = 'yiru.mobile-relay.pairing-journal.v1'
const HOSTS_STORAGE_KEY = 'yiru:hosts'
const PENDING_HOST_CLEANUP_STORAGE_KEY = 'yiru:pending-host-credential-cleanups'
const CLEANUP_COMPLETE_STORAGE_KEY = 'yiru:migrations:mobile-relay-state-removed:v1'
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
}

let cleanupInFlight: Promise<void> | null = null

function validSecretKeyHostId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]+$/.test(value)
}

function addJsonHostIds(raw: string | null, hostIds: Set<string>): void {
  if (!raw) {
    return
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (Array.isArray(value)) {
      for (const item of value) {
        if (validSecretKeyHostId(item)) {
          hostIds.add(item)
        } else if (
          item &&
          typeof item === 'object' &&
          validSecretKeyHostId((item as { hostId?: unknown }).hostId)
        ) {
          hostIds.add((item as { hostId: string }).hostId)
        }
      }
      return
    }
    if (value && typeof value === 'object') {
      const hostId = (value as { host?: { id?: unknown } }).host?.id
      if (validSecretKeyHostId(hostId)) {
        hostIds.add(hostId)
      }
    }
  } catch {
    // Unreadable legacy metadata must not block removal of other known keys.
  }
}

export async function deleteLegacyMobileRelayHostSecrets(hostId: string): Promise<void> {
  if (Platform.OS === 'web' || !validSecretKeyHostId(hostId)) {
    return
  }
  await SecureStore.deleteItemAsync(`yiru.mobile-relay.credentials.${hostId}`, KEYCHAIN_OPTIONS)
  await SecureStore.deleteItemAsync(`yiru.mobile-relay.direct-upgrade.${hostId}`, KEYCHAIN_OPTIONS)
}

async function runLegacyMobileRelayStateCleanup(baseHostIds: readonly string[]): Promise<void> {
  const [marker, hosts, overlays, pairingJournal, pendingHostCleanups] = await Promise.all([
    AsyncStorage.getItem(CLEANUP_COMPLETE_STORAGE_KEY),
    AsyncStorage.getItem(HOSTS_STORAGE_KEY),
    AsyncStorage.getItem(RELAY_OVERLAY_STORAGE_KEY),
    AsyncStorage.getItem(RELAY_PAIRING_JOURNAL_STORAGE_KEY),
    AsyncStorage.getItem(PENDING_HOST_CLEANUP_STORAGE_KEY)
  ])
  if (marker === '1' && overlays === null && pairingJournal === null) {
    return
  }

  const hostIds = new Set(baseHostIds.filter(validSecretKeyHostId))
  addJsonHostIds(hosts, hostIds)
  addJsonHostIds(overlays, hostIds)
  addJsonHostIds(pairingJournal, hostIds)
  addJsonHostIds(pendingHostCleanups, hostIds)

  if (Platform.OS !== 'web') {
    // Why: delete bearer secrets before their discoverable AsyncStorage
    // metadata. A locked keychain then leaves enough state to retry next launch.
    for (const hostId of hostIds) {
      await deleteLegacyMobileRelayHostSecrets(hostId)
    }
    await SecureStore.deleteItemAsync(RELAY_PAIRING_JOURNAL_SECRET_KEY, KEYCHAIN_OPTIONS)
  }

  await AsyncStorage.removeItem(RELAY_OVERLAY_STORAGE_KEY)
  await AsyncStorage.removeItem(RELAY_PAIRING_JOURNAL_STORAGE_KEY)
  await AsyncStorage.setItem(CLEANUP_COMPLETE_STORAGE_KEY, '1')
}

/** Remove retired Cloud Relay secrets without touching direct-pairing hosts or tokens. */
export function cleanupLegacyMobileRelayState(baseHostIds: readonly string[]): Promise<void> {
  if (!cleanupInFlight) {
    cleanupInFlight = runLegacyMobileRelayStateCleanup(baseHostIds).finally(() => {
      cleanupInFlight = null
    })
  }
  return cleanupInFlight
}
