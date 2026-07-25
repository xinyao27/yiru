import type { LanguageServerWorkspaceEditPlan } from './language-server-workspace-edit-plan'

export type LanguageServerWorkspaceEditRequest = {
  id: number
  plan: LanguageServerWorkspaceEditPlan
  applying: boolean
  error: string | null
}

type QueuedRequest = LanguageServerWorkspaceEditRequest & {
  resolve: (applied: boolean) => void
}

class LanguageServerWorkspaceEditController {
  private readonly listeners = new Set<() => void>()
  private readonly queue: QueuedRequest[] = []
  private nextId = 1
  private snapshot: LanguageServerWorkspaceEditRequest | null = null

  readonly getSnapshot = (): LanguageServerWorkspaceEditRequest | null => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  submit(plan: LanguageServerWorkspaceEditPlan): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue.push({
        id: this.nextId++,
        plan,
        applying: false,
        error: null,
        resolve
      })
      this.publishActive()
    })
  }

  cancel(): void {
    const active = this.queue[0]
    if (!active || active.applying) {
      return
    }
    active.resolve(false)
    this.queue.shift()
    this.publishActive()
  }

  async confirm(): Promise<void> {
    const active = this.queue[0]
    if (!active || active.applying) {
      return
    }
    active.applying = true
    active.error = null
    this.publishActive()
    try {
      await active.plan.apply()
      active.resolve(true)
      this.queue.shift()
    } catch (error) {
      active.applying = false
      active.error = error instanceof Error ? error.message : String(error)
    }
    this.publishActive()
  }

  private publishActive(): void {
    const active = this.queue[0]
    this.snapshot = active
      ? {
          id: active.id,
          plan: active.plan,
          applying: active.applying,
          error: active.error
        }
      : null
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const languageServerWorkspaceEditController = new LanguageServerWorkspaceEditController()
