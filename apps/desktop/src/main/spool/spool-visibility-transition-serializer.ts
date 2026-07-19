import { SpoolVisibilityError } from './spool-visibility-errors'

type SpoolVisibilityTransitionState = {
  isDegraded(): boolean
  enterDegraded(): void
  beginInitializationRecovery(): void
  completeInitializationRecovery(): void
  failInitializationRecovery(): void
}

/** Serializes visibility mutations and the fail-closed initialization recovery path. */
export class SpoolVisibilityTransitionSerializer {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly state: SpoolVisibilityTransitionState) {}

  serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.isDegraded()) {
      return Promise.reject(new SpoolVisibilityError('persistence-failed'))
    }
    return this.enqueue(async () => {
      if (this.state.isDegraded()) {
        throw new SpoolVisibilityError('persistence-failed')
      }
      try {
        const value = await operation()
        if (this.state.isDegraded()) {
          throw new SpoolVisibilityError('persistence-failed')
        }
        return value
      } catch (error) {
        if (error instanceof SpoolVisibilityError && error.code === 'persistence-failed') {
          this.state.enterDegraded()
        }
        throw error
      }
    })
  }

  serializeInitializationRecovery(operation: () => Promise<void>): Promise<void> {
    return this.enqueue(async () => {
      if (!this.state.isDegraded()) {
        return
      }
      this.state.beginInitializationRecovery()
      try {
        await operation()
        // Why: degraded remains latched until deny replay and every persisted
        // Public revalidation complete, so partial recovery is never observable.
        this.state.completeInitializationRecovery()
      } catch (error) {
        this.state.failInitializationRecovery()
        throw error
      }
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Why: worktree and project batches share one security state; serializing
    // them prevents marker validation from committing over a newer transition.
    const result = this.tail.then(operation, operation)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
