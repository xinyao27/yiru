import { RateLimitScheduler } from './service-scheduler'

export abstract class RateLimitFetchControl extends RateLimitScheduler {
  protected async fetchAll(options?: { force?: boolean }): Promise<void> {
    if (this.isFetching) {
      if (options?.force) {
        this.fullFetchQueued = true
        return this.waitForFetchIdle()
      }
      return
    }
    this.isFetching = true

    try {
      let shouldContinue = true
      while (shouldContinue) {
        const signal = await this.runWithFetchAbortSignal((fetchSignal) =>
          this.runFetchAllCycle(fetchSignal)
        )
        shouldContinue = false
        if (signal.aborted) {
          break
        }
        if (this.fullFetchQueued) {
          this.fullFetchQueued = false
          shouldContinue = true
          continue
        }
        if (this.codexOnlyFetchQueued) {
          this.codexOnlyFetchQueued = false
          const codexSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchCodexOnlyCycle(fetchSignal)
          )
          if (codexSignal.aborted) {
            break
          }
        }
        if (this.claudeOnlyFetchQueued) {
          this.claudeOnlyFetchQueued = false
          const claudeSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchClaudeOnlyCycle(fetchSignal)
          )
          if (claudeSignal.aborted) {
            break
          }
        }
        if (this.grokOnlyFetchQueued) {
          this.grokOnlyFetchQueued = false
          const grokSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchGrokOnlyCycle(fetchSignal)
          )
          if (grokSignal.aborted) {
            break
          }
        }
      }
    } finally {
      this.isFetching = false
      this.resolveFetchIdleWaiters()
    }
  }

  protected async fetchCodexOnly(options?: { force?: boolean }): Promise<void> {
    if (this.isFetching) {
      if (options?.force) {
        this.codexOnlyFetchQueued = true
        return this.waitForFetchIdle()
      }
      return
    }
    this.isFetching = true

    try {
      let shouldContinue = true
      while (shouldContinue) {
        const signal = await this.runWithFetchAbortSignal((fetchSignal) =>
          this.runFetchCodexOnlyCycle(fetchSignal)
        )
        shouldContinue = false
        if (signal.aborted) {
          break
        }
        if (this.fullFetchQueued) {
          this.fullFetchQueued = false
          const fullSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchAllCycle(fetchSignal)
          )
          if (fullSignal.aborted) {
            break
          }
          continue
        }
        if (this.codexOnlyFetchQueued) {
          this.codexOnlyFetchQueued = false
          shouldContinue = true
        }
        if (this.claudeOnlyFetchQueued) {
          this.claudeOnlyFetchQueued = false
          const claudeSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchClaudeOnlyCycle(fetchSignal)
          )
          if (claudeSignal.aborted) {
            break
          }
        }
        if (this.grokOnlyFetchQueued) {
          this.grokOnlyFetchQueued = false
          const grokSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchGrokOnlyCycle(fetchSignal)
          )
          if (grokSignal.aborted) {
            break
          }
        }
      }
    } finally {
      this.isFetching = false
      this.resolveFetchIdleWaiters()
    }
  }

  protected async fetchClaudeOnly(options?: { force?: boolean }): Promise<void> {
    if (this.isFetching) {
      if (options?.force) {
        this.claudeOnlyFetchQueued = true
        return this.waitForFetchIdle()
      }
      return
    }
    this.isFetching = true

    try {
      let shouldContinue = true
      while (shouldContinue) {
        const signal = await this.runWithFetchAbortSignal((fetchSignal) =>
          this.runFetchClaudeOnlyCycle(fetchSignal)
        )
        shouldContinue = false
        if (signal.aborted) {
          break
        }
        if (this.fullFetchQueued) {
          this.fullFetchQueued = false
          const fullSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchAllCycle(fetchSignal)
          )
          if (fullSignal.aborted) {
            break
          }
          continue
        }
        if (this.claudeOnlyFetchQueued) {
          this.claudeOnlyFetchQueued = false
          shouldContinue = true
        }
        if (this.codexOnlyFetchQueued) {
          this.codexOnlyFetchQueued = false
          const codexSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchCodexOnlyCycle(fetchSignal)
          )
          if (codexSignal.aborted) {
            break
          }
        }
        if (this.grokOnlyFetchQueued) {
          this.grokOnlyFetchQueued = false
          const grokSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchGrokOnlyCycle(fetchSignal)
          )
          if (grokSignal.aborted) {
            break
          }
        }
      }
    } finally {
      this.isFetching = false
      this.resolveFetchIdleWaiters()
    }
  }

  protected async fetchGrokOnly(options?: { force?: boolean }): Promise<void> {
    if (this.isFetching) {
      if (options?.force) {
        this.grokOnlyFetchQueued = true
        return this.waitForFetchIdle()
      }
      return
    }
    this.isFetching = true

    try {
      let shouldContinue = true
      while (shouldContinue) {
        const signal = await this.runWithFetchAbortSignal((fetchSignal) =>
          this.runFetchGrokOnlyCycle(fetchSignal)
        )
        shouldContinue = false
        if (signal.aborted) {
          break
        }
        if (this.fullFetchQueued) {
          this.fullFetchQueued = false
          const fullSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchAllCycle(fetchSignal)
          )
          if (fullSignal.aborted) {
            break
          }
          continue
        }
        if (this.grokOnlyFetchQueued) {
          this.grokOnlyFetchQueued = false
          shouldContinue = true
        }
        if (this.codexOnlyFetchQueued) {
          this.codexOnlyFetchQueued = false
          const codexSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchCodexOnlyCycle(fetchSignal)
          )
          if (codexSignal.aborted) {
            break
          }
        }
        if (this.claudeOnlyFetchQueued) {
          this.claudeOnlyFetchQueued = false
          const claudeSignal = await this.runWithFetchAbortSignal((fetchSignal) =>
            this.runFetchClaudeOnlyCycle(fetchSignal)
          )
          if (claudeSignal.aborted) {
            break
          }
        }
      }
    } finally {
      this.isFetching = false
      this.resolveFetchIdleWaiters()
    }
  }

  protected waitForFetchIdle(): Promise<void> {
    if (
      !this.isFetching &&
      !this.fullFetchQueued &&
      !this.codexOnlyFetchQueued &&
      !this.claudeOnlyFetchQueued &&
      !this.grokOnlyFetchQueued
    ) {
      return Promise.resolve()
    }
    // Why: explicit refresh callers need to await the queued follow-up cycle
    // when a poll is already in flight, otherwise the UI stops spinning before
    // the user-requested refresh actually runs.
    return new Promise((resolve) => {
      this.fetchIdleResolvers.push(resolve)
    })
  }

  protected resolveFetchIdleWaiters(): void {
    if (
      this.isFetching ||
      this.fullFetchQueued ||
      this.codexOnlyFetchQueued ||
      this.claudeOnlyFetchQueued ||
      this.grokOnlyFetchQueued
    ) {
      return
    }
    const resolvers = this.fetchIdleResolvers
    this.fetchIdleResolvers = []
    for (const resolve of resolvers) {
      resolve()
    }
  }

  protected beginFetchCycle(): AbortController {
    const controller = new AbortController()
    this.activeFetchAbortControllers.add(controller)
    return controller
  }

  protected finishFetchCycle(controller: AbortController): void {
    this.activeFetchAbortControllers.delete(controller)
  }

  protected async runWithFetchAbortSignal(
    fn: (signal: AbortSignal) => Promise<void>
  ): Promise<AbortSignal> {
    const controller = this.beginFetchCycle()
    try {
      await fn(controller.signal)
      return controller.signal
    } finally {
      this.finishFetchCycle(controller)
    }
  }

  protected abortActiveFetchCycle(): void {
    for (const controller of this.activeFetchAbortControllers) {
      controller.abort()
    }
    this.activeFetchAbortControllers.clear()
  }

  protected clearQueuedFetches(): void {
    this.fullFetchQueued = false
    this.codexOnlyFetchQueued = false
    this.claudeOnlyFetchQueued = false
    this.grokOnlyFetchQueued = false
  }

  protected abstract runFetchAllCycle(signal: AbortSignal): Promise<void>
  protected abstract runFetchCodexOnlyCycle(signal: AbortSignal): Promise<void>
  protected abstract runFetchClaudeOnlyCycle(signal: AbortSignal): Promise<void>
  protected abstract runFetchGrokOnlyCycle(signal: AbortSignal): Promise<void>
}
