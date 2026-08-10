import { randomUUID } from 'node:crypto'

import { SKILLS_MARKETPLACE_PARTITION, YIRU_BROWSER_PARTITION } from '~shared/constants'
import type { BrowserSessionProfile, BrowserSessionProfileScope } from '~shared/types'
import {
  DEFAULT_LOCAL_YIRU_PROFILE_ID,
  getYiruProfileBrowserDefaultPartition,
  getYiruProfileBrowserSessionPartition
} from '~shared/yiru-profiles'

import type { BrowserSession } from './session'
import { BrowserSessionMetadata } from './session-metadata'
import { parsePersistedBrowserSessionProfile } from './session-profile'
import { setupClientHintsOverride } from './session-ua'

export type BrowserSessionRegistryProfileOptions = {
  yiruProfileId: string
  profileDirectory: string
}

export type BrowserSessionPoliciesPort = {
  get(partition: string): BrowserSession | null
  install(partition: string): BrowserSession | null
  remove(partition: string): void
}

const unavailableBrowserSessionPolicies: BrowserSessionPoliciesPort = {
  get: () => null,
  install: () => null,
  remove: () => {}
}

// Why: this registry is the single authority for partitions admitted by
// will-attach-webview. Session creation itself belongs to the injected backend.
class BrowserSessionRegistry {
  private activeYiruProfileId = DEFAULT_LOCAL_YIRU_PROFILE_ID
  private defaultPartition = YIRU_BROWSER_PARTITION
  private readonly metadata = new BrowserSessionMetadata(this.defaultPartition)
  private policies: BrowserSessionPoliciesPort = unavailableBrowserSessionPolicies
  private readonly profiles = new Map<string, BrowserSessionProfile>()
  private headlessProfileStorageEnabled = false

  constructor() {
    this.resetDefaultProfile()
  }

  setPolicies(policies: BrowserSessionPoliciesPort): void {
    this.policies = policies
  }

  enableHeadlessProfileStorage(): void {
    this.headlessProfileStorageEnabled = true
  }

  configureForYiruProfile(options: BrowserSessionRegistryProfileOptions): void {
    this.activeYiruProfileId = options.yiruProfileId
    this.defaultPartition = getYiruProfileBrowserDefaultPartition(options.yiruProfileId)
    this.metadata.configure(options.profileDirectory, this.defaultPartition)
    this.profiles.clear()
    this.resetDefaultProfile()
  }

  initializeBrowserSessionsFromPersistedState(): void {
    const meta = this.metadata.load()
    const current = this.profiles.get('default')
    if (meta.defaultSource && current?.source === null) {
      this.profiles.set('default', { ...current, source: meta.defaultSource })
    }
    this.hydrateFromPersisted(meta.profiles)

    // Why: policies and UA must be installed before the first guest request.
    // A missing provider leaves the partition unconfigured rather than
    // claiming that permissions or download handling are available.
    const partitions = new Set([
      this.defaultPartition,
      SKILLS_MARKETPLACE_PARTITION,
      ...this.listProfiles().map((profile) => profile.partition)
    ])
    for (const partition of partitions) {
      const session = this.policies.install(partition)
      if (!session) {
        continue
      }
      const persistedUserAgent = meta.userAgentByPartition[partition]
      if (persistedUserAgent) {
        session.setUserAgent(persistedUserAgent)
        setupClientHintsOverride(session, persistedUserAgent)
      }
    }
  }

  applyPendingCookieImport(): void {
    const meta = this.metadata.load()
    const knownPartitions = new Set([this.defaultPartition])
    for (const candidate of meta.profiles) {
      const profile = parsePersistedBrowserSessionProfile(candidate, this.activeYiruProfileId)
      if (profile) {
        knownPartitions.add(profile.partition)
      }
    }
    this.metadata.replayPendingCookieImports(knownPartitions)
  }

  setPendingCookieImport(partition: string, stagingDbPath: string): void {
    const meta = this.metadata.load()
    const pendingCookieImports = { ...meta.pendingCookieImports, [partition]: stagingDbPath }
    this.metadata.persist({
      pendingCookieImports,
      pendingCookieDbPath: pendingCookieImports[this.defaultPartition] ?? null
    })
  }

  persistUserAgent(partition: string, userAgent: string | null): void {
    const meta = this.metadata.load()
    const userAgentByPartition = { ...meta.userAgentByPartition }
    if (userAgent) {
      userAgentByPartition[partition] = userAgent
    } else {
      delete userAgentByPartition[partition]
    }
    this.metadata.persist({
      userAgentByPartition,
      userAgent: userAgentByPartition[this.defaultPartition] ?? null
    })
  }

  getDefaultProfile(): BrowserSessionProfile {
    const profile = this.profiles.get('default')
    if (!profile) {
      throw new Error('Default browser session profile is unavailable')
    }
    return profile
  }

  getProfile(profileId: string): BrowserSessionProfile | null {
    return this.profiles.get(profileId) ?? null
  }

  listProfiles(): BrowserSessionProfile[] {
    return [...this.profiles.values()]
  }

  isAllowedPartition(partition: string): boolean {
    if (partition === this.defaultPartition || partition === SKILLS_MARKETPLACE_PARTITION) {
      return this.policies.get(partition) !== null
    }
    return [...this.profiles.values()].some((profile) => profile.partition === partition)
  }

  resolvePartition(profileId: string | null | undefined): string {
    return profileId
      ? (this.profiles.get(profileId)?.partition ?? this.defaultPartition)
      : this.defaultPartition
  }

  resolveKnownPartition(profileId: string | null | undefined): string | null {
    return profileId ? (this.profiles.get(profileId)?.partition ?? null) : this.defaultPartition
  }

  createProfile(scope: BrowserSessionProfileScope, label: string): BrowserSessionProfile | null {
    if (scope === 'default') {
      return null
    }
    const id = randomUUID()
    const partition = getYiruProfileBrowserSessionPartition(this.activeYiruProfileId, id)
    // Why: do not admit a partition to the renderer allowlist until its deny-
    // by-default policies are live.
    if (!this.headlessProfileStorageEnabled && !this.policies.install(partition)) {
      return null
    }
    const profile: BrowserSessionProfile = { id, scope, partition, label, source: null }
    this.profiles.set(id, profile)
    this.persistProfiles()
    return profile
  }

  updateProfileSource(
    profileId: string,
    source: BrowserSessionProfile['source']
  ): BrowserSessionProfile | null {
    const profile = this.profiles.get(profileId)
    if (!profile) {
      return null
    }
    const updated = { ...profile, source }
    this.profiles.set(profileId, updated)
    if (profileId === 'default') {
      this.metadata.persist({ defaultSource: source })
    } else {
      this.persistProfiles()
    }
    return updated
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const profile = this.profiles.get(profileId)
    if (!profile || profile.scope === 'default') {
      return false
    }
    this.profiles.delete(profileId)
    this.persistProfiles()
    this.removePersistedPartitionState(profile.partition)

    const session = this.policies.get(profile.partition)
    this.policies.remove(profile.partition)
    if (session) {
      try {
        await session.clearStorage()
        await session.clearCache()
      } catch {
        // Why: the profile is already removed from the allowlist; disk cleanup
        // can be retried by Chromium without keeping the unsafe capability live.
      }
    }
    return true
  }

  async clearDefaultSessionCookies(): Promise<boolean> {
    const session = this.policies.get(this.defaultPartition)
    if (!session) {
      return false
    }
    this.clearDefaultProfileMetadata()
    try {
      await session.clearCookies()
      return true
    } catch {
      return false
    }
  }

  clearDefaultProfileMetadata(): void {
    const defaultProfile = this.profiles.get('default')
    if (defaultProfile) {
      this.profiles.set('default', { ...defaultProfile, source: null })
    }
    const meta = this.metadata.load()
    const pendingCookieImports = { ...meta.pendingCookieImports }
    const userAgentByPartition = { ...meta.userAgentByPartition }
    delete pendingCookieImports[this.defaultPartition]
    delete userAgentByPartition[this.defaultPartition]
    this.metadata.persist({
      defaultSource: null,
      userAgent: null,
      userAgentByPartition,
      pendingCookieDbPath: null,
      pendingCookieImports
    })
  }

  private hydrateFromPersisted(candidates: unknown[]): void {
    for (const candidate of candidates) {
      const profile = parsePersistedBrowserSessionProfile(candidate, this.activeYiruProfileId)
      if (
        !profile ||
        (!this.headlessProfileStorageEnabled && !this.policies.install(profile.partition))
      ) {
        continue
      }
      this.profiles.set(profile.id, profile)
    }
  }

  private persistProfiles(): void {
    this.metadata.persist({
      profiles: [...this.profiles.values()].filter((profile) => profile.id !== 'default')
    })
  }

  private removePersistedPartitionState(partition: string): void {
    const meta = this.metadata.load()
    const pendingCookieImports = { ...meta.pendingCookieImports }
    const userAgentByPartition = { ...meta.userAgentByPartition }
    delete pendingCookieImports[partition]
    delete userAgentByPartition[partition]
    this.metadata.persist({
      pendingCookieImports,
      pendingCookieDbPath: pendingCookieImports[this.defaultPartition] ?? null,
      userAgentByPartition,
      userAgent: userAgentByPartition[this.defaultPartition] ?? null
    })
  }

  private resetDefaultProfile(): void {
    this.profiles.set('default', {
      id: 'default',
      scope: 'default',
      partition: this.defaultPartition,
      label: 'Default',
      source: this.metadata.load().defaultSource
    })
  }
}

export const browserSessionRegistry = new BrowserSessionRegistry()
