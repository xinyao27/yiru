import { SpoolExecutionError } from '../../../spool/spool-execution-error'
import {
  encodeSpoolHostSessionPageReleaseBinding,
  type SpoolHostSessionPageBinding,
  type SpoolHostSessionPageReleaseBinding
} from './spool-host-session-page-binding'

type SessionPageOpening = {
  releaseBindingKey: string
  physicalConnectionId: string
  cancel: () => void | Promise<void>
}

export type SpoolHostSessionPageOpening = Readonly<{ value: SessionPageOpening }>

/** Cancels first-page reads before they have an opaque cursor. */
export class SpoolHostSessionPageOpenings {
  private readonly entries = new Map<string, SessionPageOpening>()

  get size(): number {
    return this.entries.size
  }

  begin(
    binding: SpoolHostSessionPageBinding,
    cancel: () => void | Promise<void>
  ): SpoolHostSessionPageOpening {
    const releaseBindingKey = encodeSpoolHostSessionPageReleaseBinding(binding)
    if (this.entries.has(releaseBindingKey)) {
      throw new SpoolExecutionError('resource_busy')
    }
    const value = { releaseBindingKey, physicalConnectionId: binding.physicalConnectionId, cancel }
    this.entries.set(releaseBindingKey, value)
    return { value }
  }

  finish(opening: SpoolHostSessionPageOpening): void {
    if (this.entries.get(opening.value.releaseBindingKey) === opening.value) {
      this.entries.delete(opening.value.releaseBindingKey)
    }
  }

  release(binding: SpoolHostSessionPageReleaseBinding): void {
    const key = encodeSpoolHostSessionPageReleaseBinding(binding)
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
