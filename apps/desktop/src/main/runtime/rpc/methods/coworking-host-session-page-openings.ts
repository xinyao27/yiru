import { CoworkingExecutionError } from '~main/coworking/execution-error'

import {
  encodeCoworkingHostSessionPageReleaseBinding,
  type CoworkingHostSessionPageBinding,
  type CoworkingHostSessionPageReleaseBinding
} from './coworking-host-session-page-binding'

type SessionPageOpening = {
  releaseBindingKey: string
  physicalConnectionId: string
  cancel: () => void | Promise<void>
}

export type CoworkingHostSessionPageOpening = Readonly<{ value: SessionPageOpening }>

/** Cancels first-page reads before they have an opaque cursor. */
export class CoworkingHostSessionPageOpenings {
  private readonly entries = new Map<string, SessionPageOpening>()

  get size(): number {
    return this.entries.size
  }

  begin(
    binding: CoworkingHostSessionPageBinding,
    cancel: () => void | Promise<void>
  ): CoworkingHostSessionPageOpening {
    const releaseBindingKey = encodeCoworkingHostSessionPageReleaseBinding(binding)
    if (this.entries.has(releaseBindingKey)) {
      throw new CoworkingExecutionError('resource_busy')
    }
    const value = { releaseBindingKey, physicalConnectionId: binding.physicalConnectionId, cancel }
    this.entries.set(releaseBindingKey, value)
    return { value }
  }

  finish(opening: CoworkingHostSessionPageOpening): void {
    if (this.entries.get(opening.value.releaseBindingKey) === opening.value) {
      this.entries.delete(opening.value.releaseBindingKey)
    }
  }

  release(binding: CoworkingHostSessionPageReleaseBinding): void {
    const key = encodeCoworkingHostSessionPageReleaseBinding(binding)
    const opening = this.entries.get(key)
    if (opening) {
      this.cancel(opening)
    }
  }

  releaseConnection(connectionId: string): void {
    for (const opening of this.entries.values()) {
      if (opening.physicalConnectionId === connectionId) {
        this.cancel(opening)
      }
    }
  }

  private cancel(opening: SessionPageOpening): void {
    this.entries.delete(opening.releaseBindingKey)
    void Promise.resolve(opening.cancel()).catch(() => {})
  }
}
