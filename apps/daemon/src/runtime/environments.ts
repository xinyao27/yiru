import type { ShellRuntimeEnvironmentOrpcStreamEvent } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import {
  redactRuntimeEnvironment,
  type PublicKnownRuntimeEnvironment
} from '@yiru/runtime-protocol/workbench/runtime-environments'
import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'
import {
  listEnvironments,
  removeEnvironment,
  resolveEnvironment
} from '~main/runtime-environment-store'

import type { Store } from '../persistence/store'
import { clearActiveRuntimeEnvironmentFocusIfMatches } from '../runtime-environment-focus-self-heal'
import {
  callRuntimeEnvironmentExistingRoute,
  subscribeRuntimeEnvironmentExistingRoute
} from './environment-existing-route'
import { closeRemoteRuntimeRequestConnection } from './environment-request-connections'
import {
  clearSharedControlSupport,
  getRuntimeEnvironmentStatus,
  resetSharedControlSupport
} from './environment-transport-routing'
import { getRuntimeHostPathsProvider } from './host/paths-provider'

let environmentRegistryStore: Store | null = null

export function initializeRuntimeEnvironmentRegistry(store: Store): void {
  environmentRegistryStore = store
  resetSharedControlSupport()
}

export function listPublicRuntimeEnvironments(): PublicKnownRuntimeEnvironment[] {
  // Why: `source` is persisted on the env record, so read it directly instead of
  // joining the VM store — a corrupt VM store must not break listing all envs.
  return listEnvironments(getUserDataPath()).map(redactRuntimeEnvironment)
}

export function resolvePublicRuntimeEnvironment(selector: string): PublicKnownRuntimeEnvironment {
  return redactRuntimeEnvironment(resolveEnvironment(getUserDataPath(), selector))
}

export function removePublicRuntimeEnvironment(selector: string): {
  removed: PublicKnownRuntimeEnvironment
} {
  const removed = removeEnvironment(getUserDataPath(), selector)
  closeEnvironmentConnections(selector, removed.id)
  clearActiveRuntimeEnvironmentFocusIfMatches(requireEnvironmentRegistryStore(), removed.id)
  return { removed: redactRuntimeEnvironment(removed) }
}

export function disconnectPublicRuntimeEnvironment(selector: string): {
  disconnected: PublicKnownRuntimeEnvironment
} {
  const environment = resolveEnvironment(getUserDataPath(), selector)
  // Why: disconnect is intentionally non-destructive; it drops live
  // transport state while keeping the paired server available for later.
  closeEnvironmentConnections(selector, environment.id)
  return { disconnected: redactRuntimeEnvironment(environment) }
}

export function getPublicRuntimeEnvironmentStatus(
  selector: string,
  timeoutMs?: number
): Promise<RuntimeRpcResponse<RuntimeStatus>> {
  return getRuntimeEnvironmentStatus(getUserDataPath(), selector, timeoutMs)
}

export async function callPublicRuntimeEnvironmentOrpcProcedure(args: {
  selector: string
  path: readonly string[]
  input: unknown
  timeoutMs?: number
}): Promise<unknown> {
  assertRuntimeEnvironmentOrpcPath(args.path)
  const response = await callRuntimeEnvironmentExistingRoute(
    getUserDataPath(),
    args.selector,
    args.path.join('.'),
    args.input,
    args.timeoutMs
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result
}

export async function* subscribePublicRuntimeEnvironmentOrpcProcedure(
  args: { selector: string; path: readonly string[]; input: unknown },
  signal?: AbortSignal
): AsyncGenerator<ShellRuntimeEnvironmentOrpcStreamEvent> {
  assertRuntimeEnvironmentOrpcPath(args.path)
  const queue = new RuntimeEnvironmentOrpcStreamQueue()
  const subscription = await subscribeRuntimeEnvironmentExistingRoute(
    getUserDataPath(),
    args.selector,
    args.path.join('.'),
    args.input,
    {
      onEvent: (event) => {
        if (event.type === 'response') {
          if (event.response.ok) {
            queue.push({ type: 'value', value: event.response.result })
          } else {
            queue.fail(new Error(event.response.error.message))
          }
          return
        }
        if (event.type === 'binary') {
          queue.push({ type: 'binary', bytes: event.bytes })
          return
        }
        if (event.type === 'error') {
          queue.fail(new Error(event.message))
          return
        }
        queue.end()
      },
      onClose: () => queue.end()
    }
  )
  const abort = (): void => {
    subscription.close()
    queue.end()
  }
  if (signal?.aborted) {
    abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }
  try {
    while (true) {
      const item = await queue.next()
      if (item.type === 'done') {
        return
      }
      if (item.type === 'error') {
        throw item.error
      }
      yield item.event
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    subscription.close()
  }
}

type RuntimeEnvironmentOrpcStreamQueueItem =
  | { type: 'event'; event: ShellRuntimeEnvironmentOrpcStreamEvent }
  | { type: 'error'; error: Error }
  | { type: 'done' }

class RuntimeEnvironmentOrpcStreamQueue {
  private readonly items: RuntimeEnvironmentOrpcStreamQueueItem[] = []
  private waiter: ((item: RuntimeEnvironmentOrpcStreamQueueItem) => void) | null = null
  private isDone = false

  push(event: ShellRuntimeEnvironmentOrpcStreamEvent): void {
    if (!this.isDone) {
      this.enqueue({ type: 'event', event })
    }
  }

  fail(error: Error): void {
    if (!this.isDone) {
      this.isDone = true
      this.enqueue({ type: 'error', error })
    }
  }

  end(): void {
    if (!this.isDone) {
      this.isDone = true
      this.enqueue({ type: 'done' })
    }
  }

  next(): Promise<RuntimeEnvironmentOrpcStreamQueueItem> {
    const item = this.items.shift()
    if (item) {
      return Promise.resolve(item)
    }
    if (this.isDone) {
      return Promise.resolve({ type: 'done' })
    }
    return new Promise((resolve) => {
      this.waiter = resolve
    })
  }

  private enqueue(item: RuntimeEnvironmentOrpcStreamQueueItem): void {
    const waiter = this.waiter
    if (waiter) {
      this.waiter = null
      waiter(item)
      return
    }
    this.items.push(item)
  }
}

function assertRuntimeEnvironmentOrpcPath(path: readonly string[]): void {
  if (path.length === 0 || path.some((segment) => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(segment))) {
    throw new Error('invalid_runtime_environment_orpc_path')
  }
}

function closeEnvironmentConnections(selector: string, environmentId: string): void {
  closeRemoteRuntimeRequestConnection(environmentId)
  clearSharedControlSupport(environmentId)
  if (selector !== environmentId) {
    closeRemoteRuntimeRequestConnection(selector)
    clearSharedControlSupport(selector)
  }
}

function getUserDataPath(): string {
  return getRuntimeHostPathsProvider().userDataPath()
}

function requireEnvironmentRegistryStore(): Store {
  if (!environmentRegistryStore) {
    throw new Error('Runtime environment registry is unavailable')
  }
  return environmentRegistryStore
}
