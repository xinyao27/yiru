import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { unwrapRuntimeRpcResult } from '~renderer/runtime/rpc-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import { useAppStore } from '~renderer/store'
import type { PublicKnownRuntimeEnvironment } from '~shared/runtime-environments'
import type { RuntimeStatus } from '~shared/runtime-types'

import { evaluateHostDetails, type RuntimeHostDetails } from './runtime-environment-status'

export type RuntimeEnvironmentList = {
  environments: PublicKnownRuntimeEnvironment[]
  isLoading: boolean
  detailsByEnvironmentId: Record<string, RuntimeHostDetails>
  setDetailsByEnvironmentId: React.Dispatch<
    React.SetStateAction<Record<string, RuntimeHostDetails>>
  >
  loadEnvironments: () => Promise<void>
  mountedRef: MutableRefObject<boolean>
}

export function useRuntimeEnvironmentList(): RuntimeEnvironmentList {
  const [environments, setEnvironments] = useState<PublicKnownRuntimeEnvironment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [detailsByEnvironmentId, setDetailsByEnvironmentId] = useState<
    Record<string, RuntimeHostDetails>
  >({})
  const mountedRef = useMountedRef()

  const loadEnvironments = useCallback(async (): Promise<void> => {
    if (mountedRef.current) {
      setIsLoading(true)
    }
    try {
      const nextEnvironments = await runtimeEnvironmentsClient.list()
      useAppStore.getState().setRuntimeEnvironments(nextEnvironments)
      if (mountedRef.current) {
        setEnvironments(nextEnvironments)
        setDetailsByEnvironmentId((current) => {
          const next: Record<string, RuntimeHostDetails> = {}
          for (const environment of nextEnvironments) {
            next[environment.id] = current[environment.id] ?? {
              status: 'loading',
              runtimeStatus: null,
              compatibility: null,
              error: null
            }
          }
          return next
        })
      }
      await Promise.allSettled(
        nextEnvironments.map((environment) =>
          probeRuntimeEnvironment(environment, mountedRef, setDetailsByEnvironmentId)
        )
      )
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.RuntimeEnvironmentsPane.e6410d72c3',
                'Failed to load runtime environments.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void loadEnvironments()
  }, [loadEnvironments])

  return {
    environments,
    isLoading,
    detailsByEnvironmentId,
    setDetailsByEnvironmentId,
    loadEnvironments,
    mountedRef
  }
}

async function probeRuntimeEnvironment(
  environment: PublicKnownRuntimeEnvironment,
  mountedRef: MutableRefObject<boolean>,
  setDetails: React.Dispatch<React.SetStateAction<Record<string, RuntimeHostDetails>>>
): Promise<void> {
  try {
    const response = await runtimeEnvironmentsClient.getStatus({
      selector: environment.id,
      timeoutMs: 10_000
    })
    const runtimeStatus = unwrapRuntimeRpcResult<RuntimeStatus>(response)
    useAppStore.getState().setRuntimeEnvironmentStatus(environment.id, {
      status: runtimeStatus,
      checkedAt: Date.now()
    })
    if (mountedRef.current) {
      setDetails((current) => ({
        ...current,
        [environment.id]: {
          status: 'ready',
          runtimeStatus,
          compatibility: evaluateHostDetails(runtimeStatus),
          error: null
        }
      }))
    }
  } catch (error) {
    useAppStore.getState().setRuntimeEnvironmentStatus(environment.id, {
      status: null,
      checkedAt: Date.now()
    })
    if (mountedRef.current) {
      setDetails((current) => ({
        ...current,
        [environment.id]: {
          status: 'error',
          runtimeStatus: null,
          compatibility: null,
          error: error instanceof Error ? error.message : String(error)
        }
      }))
    }
  }
}
