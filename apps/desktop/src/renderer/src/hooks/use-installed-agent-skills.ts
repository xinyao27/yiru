import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { markOrchestrationSetupComplete } from '@/lib/orchestration-setup-state'
import {
  getInstalledAgentSkillDiscoveryGeneration,
  INSTALLED_AGENT_SKILLS_CHANGED_EVENT,
  peekInstalledAgentSkillDiscovery,
  pendingDiscoveryByTarget,
  pendingDiscoverySatisfiesForcedRefreshByTarget,
  readInstalledAgentSkillDiscovery,
  writeInstalledAgentSkillDiscovery
} from '@/runtime/installed-agent-skill-discovery-state'

import type {
  DiscoveredSkill,
  SkillDiscoveryResult,
  SkillDiscoveryTarget,
  SkillSourceKind
} from '../../../shared/skills'
import {
  hasInstalledAgentSkillNamed,
  isOrchestrationSkillName,
  normalizeInstalledSkillName
} from './installed-agent-skill-match'
import { useMountedRef } from './use-mounted-ref'

export { hasInstalledAgentSkill, hasInstalledAgentSkillNamed } from './installed-agent-skill-match'

export const GLOBAL_AGENT_SKILL_SOURCE_KINDS = [
  'home'
] as const satisfies readonly SkillSourceKind[]

type InstalledAgentSkillOptions = {
  enabled?: boolean
  discoveryTarget?: SkillDiscoveryTarget
  sourceKinds?: readonly SkillSourceKind[]
}

export type InstalledAgentSkillState = {
  installed: boolean
  loading: boolean
  error: string | null
  skills: readonly DiscoveredSkill[]
  refresh: () => Promise<boolean>
}

function normalizeSkillDiscoveryTarget(
  target: SkillDiscoveryTarget | undefined
): SkillDiscoveryTarget | undefined {
  const projectRuntime = target?.projectRuntime
  if (projectRuntime) {
    if (projectRuntime.status === 'repair-required') {
      return { projectRuntime }
    }
    if (projectRuntime.runtime.kind === 'wsl') {
      return {
        runtime: 'wsl',
        wslDistro: projectRuntime.runtime.distro,
        projectRuntime
      }
    }
    return {
      runtime: 'host',
      projectRuntime
    }
  }

  if (target?.runtime !== 'wsl') {
    return undefined
  }
  return { runtime: 'wsl', wslDistro: target.wslDistro?.trim() || null }
}

function getSkillDiscoveryTargetKey(target: SkillDiscoveryTarget | undefined): string {
  if (target?.projectRuntime) {
    return target.projectRuntime.status === 'resolved'
      ? target.projectRuntime.runtime.cacheKey
      : target.projectRuntime.repair.cacheKey
  }
  const normalizedTarget = normalizeSkillDiscoveryTarget(target)
  return normalizedTarget?.runtime === 'wsl' ? `wsl:${normalizedTarget.wslDistro ?? ''}` : 'host'
}

function startInstalledAgentSkillDiscovery(
  force: boolean,
  target: SkillDiscoveryTarget | undefined
): Promise<SkillDiscoveryResult> {
  const key = getSkillDiscoveryTargetKey(target)
  const generation = getInstalledAgentSkillDiscoveryGeneration()
  const normalizedTarget = normalizeSkillDiscoveryTarget(target)
  const discovery = window.api.skills
    .discover(normalizedTarget)
    .then((result) => {
      writeInstalledAgentSkillDiscovery(key, result, generation)
      return result
    })
    .finally(() => {
      if (pendingDiscoveryByTarget.get(key) === discovery) {
        pendingDiscoveryByTarget.delete(key)
        pendingDiscoverySatisfiesForcedRefreshByTarget.delete(key)
      }
    })
  pendingDiscoveryByTarget.set(key, discovery)
  pendingDiscoverySatisfiesForcedRefreshByTarget.set(key, force)
  return discovery
}

async function discoverInstalledAgentSkills(
  force: boolean,
  target?: SkillDiscoveryTarget
): Promise<SkillDiscoveryResult> {
  const key = getSkillDiscoveryTargetKey(target)
  if (!force) {
    const cachedDiscovery = readInstalledAgentSkillDiscovery(key)
    if (cachedDiscovery) {
      return cachedDiscovery
    }
  }

  const inFlightDiscovery = pendingDiscoveryByTarget.get(key)
  if (inFlightDiscovery) {
    if (!force || pendingDiscoverySatisfiesForcedRefreshByTarget.get(key)) {
      return inFlightDiscovery
    }
    try {
      await inFlightDiscovery
    } catch {
      // Why: an explicit re-check should still read current disk state even if
      // the older background scan failed.
    }
    const nextPendingDiscovery = pendingDiscoveryByTarget.get(key)
    if (nextPendingDiscovery && nextPendingDiscovery !== inFlightDiscovery) {
      return nextPendingDiscovery
    }
  }

  return startInstalledAgentSkillDiscovery(force, target)
}

export function useInstalledAgentSkill(
  skillName: string,
  options: InstalledAgentSkillOptions = {}
): InstalledAgentSkillState {
  return useInstalledAgentSkillNames([skillName], options)
}

export function useInstalledAgentSkillNames(
  skillNames: readonly string[],
  options: InstalledAgentSkillOptions = {}
): InstalledAgentSkillState {
  const { enabled = true, discoveryTarget, sourceKinds } = options
  const skillNamesKey = skillNames.map(normalizeInstalledSkillName).join('\n')
  const candidateSkillNames = useMemo(() => skillNamesKey.split('\n'), [skillNamesKey])
  const discoveryTargetKey = getSkillDiscoveryTargetKey(discoveryTarget)
  // Why: store-backed callers can rebuild an equivalent target object on unrelated writes.
  // Latch one target per stable key so refresh and its discovery effect do not restart.
  const latchedDiscoveryTargetRef = useRef({
    key: discoveryTargetKey,
    target: discoveryTarget
  })
  if (latchedDiscoveryTargetRef.current.key !== discoveryTargetKey) {
    latchedDiscoveryTargetRef.current = { key: discoveryTargetKey, target: discoveryTarget }
  }
  const stableDiscoveryTarget = latchedDiscoveryTargetRef.current.target
  const cachedDiscovery = peekInstalledAgentSkillDiscovery(discoveryTargetKey)
  const [result, setResult] = useState<SkillDiscoveryResult | null>(cachedDiscovery)
  const [loading, setLoading] = useState(enabled && !cachedDiscovery)
  const [error, setError] = useState<string | null>(null)
  const currentDiscoveryTargetKeyRef = useRef(discoveryTargetKey)
  const refreshGenerationRef = useRef(0)
  const stateResetInputRef = useRef({ discoveryTargetKey, enabled })
  currentDiscoveryTargetKeyRef.current = discoveryTargetKey
  // Why: skill scans can outlive transient settings/onboarding panels; keep
  // the module cache update but skip React state writes after unmount.
  const mountedRef = useMountedRef()
  let resultForRender = result
  let loadingForRender = loading
  let errorForRender = error
  if (
    stateResetInputRef.current.discoveryTargetKey !== discoveryTargetKey ||
    stateResetInputRef.current.enabled !== enabled
  ) {
    const nextCachedDiscovery = peekInstalledAgentSkillDiscovery(discoveryTargetKey)
    const nextLoading = enabled && !nextCachedDiscovery
    stateResetInputRef.current = { discoveryTargetKey, enabled }
    resultForRender = nextCachedDiscovery
    loadingForRender = nextLoading
    errorForRender = null
    setResult(nextCachedDiscovery)
    setLoading(nextLoading)
    setError(null)
  }

  const refresh = useCallback(
    async (force = true): Promise<boolean> => {
      const requestDiscoveryTargetKey = discoveryTargetKey
      const requestGeneration = ++refreshGenerationRef.current
      const writeIfCurrent = (write: () => void): void => {
        if (
          mountedRef.current &&
          requestGeneration === refreshGenerationRef.current &&
          currentDiscoveryTargetKeyRef.current === requestDiscoveryTargetKey
        ) {
          write()
        }
      }

      if (!enabled) {
        writeIfCurrent(() => {
          setLoading(false)
        })
        return false
      }
      writeIfCurrent(() => {
        setLoading(true)
      })
      let installedAfterRefresh = false
      try {
        const next = await discoverInstalledAgentSkills(force, stableDiscoveryTarget)
        installedAfterRefresh = hasInstalledAgentSkillNamed(next.skills, candidateSkillNames, {
          sourceKinds
        })
        writeIfCurrent(() => {
          setResult(next)
          setError(null)
        })
      } catch (refreshError) {
        writeIfCurrent(() => {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Could not scan installed skills.'
          )
        })
      } finally {
        writeIfCurrent(() => {
          setLoading(false)
        })
      }
      return installedAfterRefresh
    },
    [
      candidateSkillNames,
      discoveryTargetKey,
      enabled,
      mountedRef,
      sourceKinds,
      stableDiscoveryTarget
    ]
  )

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const refreshFromExternalChange = (): void => {
      void refresh(true)
    }
    // Why: skill install commands run outside React state, often in a terminal.
    // Refresh on focus and explicit install events so completion is detected.
    window.addEventListener('focus', refreshFromExternalChange)
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refreshFromExternalChange)
    return () => {
      window.removeEventListener('focus', refreshFromExternalChange)
      window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refreshFromExternalChange)
    }
  }, [enabled, refresh])

  const skills = useMemo(
    () => (enabled && resultForRender ? resultForRender.skills : []),
    [enabled, resultForRender]
  )

  const installed = useMemo(
    () =>
      enabled ? hasInstalledAgentSkillNamed(skills, candidateSkillNames, { sourceKinds }) : false,
    [candidateSkillNames, enabled, skills, sourceKinds]
  )

  useEffect(() => {
    if (installed && candidateSkillNames.some(isOrchestrationSkillName)) {
      // Why: older floating-workspace education still keys off this marker; any
      // surface that detects the orchestration skill should satisfy setup.
      markOrchestrationSetupComplete()
    }
  }, [candidateSkillNames, installed])

  const forceRefresh = useCallback(() => refresh(true), [refresh])

  return {
    installed,
    loading: loadingForRender,
    error: errorForRender,
    skills,
    refresh: forceRefresh
  }
}
