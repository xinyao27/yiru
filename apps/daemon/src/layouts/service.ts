import type { RuntimeAppliedLayoutPane, RuntimeLayoutRecipe } from '@yiru/runtime-protocol/contract'

import type { WorkspaceEventLog } from '../events/log'
import type { WorktreeCatalog } from '../git/worktree/worktrees'
import type { HostRegistry } from '../hosts/registry'
import type { AgentSessionService } from '../sessions/service'
import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import { readLayoutRecipes } from './config'

export class LayoutService {
  private readonly agents: AgentSessionService
  private readonly events: WorkspaceEventLog
  private readonly hosts: HostRegistry
  private readonly runtime: WorkbenchRuntimeBridge
  private readonly worktrees: WorktreeCatalog

  constructor(
    worktrees: WorktreeCatalog,
    runtime: WorkbenchRuntimeBridge,
    agents: AgentSessionService,
    events: WorkspaceEventLog,
    hosts: HostRegistry
  ) {
    this.worktrees = worktrees
    this.runtime = runtime
    this.agents = agents
    this.events = events
    this.hosts = hosts
  }

  async list(worktreeSelector: string): Promise<RuntimeLayoutRecipe[]> {
    const worktree = await this.worktrees.resolve(worktreeSelector)
    return readLayoutRecipes(worktree.path, this.hosts.get(worktree.hostId))
  }

  async apply(input: {
    expectedRevision: number
    name: string
    worktree: string
  }): Promise<{ panes: RuntimeAppliedLayoutPane[]; revision: number }> {
    const worktree = await this.worktrees.resolve(input.worktree)
    const recipe = (await readLayoutRecipes(worktree.path, this.hosts.get(worktree.hostId))).find(
      (candidate) => candidate.name === input.name
    )
    if (!recipe) {
      throw new Error('layout_recipe_not_found')
    }
    return this.events.runAtRevision(worktree.repoId, input.expectedRevision, () =>
      this.applyRecipe(worktree.id, worktree.repoId, recipe)
    )
  }

  private async applyRecipe(
    worktreeId: string,
    repoId: string,
    recipe: RuntimeLayoutRecipe
  ): Promise<{ panes: RuntimeAppliedLayoutPane[]; revision: number }> {
    this.events.append(repoId, 'layout.apply.started', {
      name: recipe.name,
      worktreeId
    })
    const started: RuntimeAppliedLayoutPane[] = []
    try {
      for (const pane of recipe.panes) {
        const applied = await this.startPane(worktreeId, pane)
        started.push(applied)
        this.events.append(repoId, 'layout.apply.pane-started', {
          name: recipe.name,
          terminalHandle: applied.terminalHandle,
          title: applied.title,
          worktreeId
        })
      }
      const complete = this.events.append(repoId, 'layout.apply.complete', {
        name: recipe.name,
        paneCount: started.length,
        worktreeId
      })
      return { panes: started, revision: complete.revision }
    } catch (error) {
      await this.rollback(started)
      this.events.append(repoId, 'layout.apply.failed', {
        detail: error instanceof Error ? error.message : String(error),
        name: recipe.name,
        worktreeId
      })
      throw error
    }
  }

  private async rollback(panes: RuntimeAppliedLayoutPane[]): Promise<void> {
    await Promise.allSettled(
      panes.map((pane) =>
        pane.sessionId
          ? this.agents.stop(pane.sessionId)
          : this.runtime.closeWorkbenchTerminal(pane.terminalHandle)
      )
    )
  }

  private async startPane(
    worktreeId: string,
    pane: RuntimeLayoutRecipe['panes'][number]
  ): Promise<RuntimeAppliedLayoutPane> {
    switch (pane.kind) {
      case 'agent': {
        const session = await this.agents.start({
          agent: pane.agent,
          prompt: pane.prompt,
          title: pane.title,
          worktreeId
        })
        return {
          sessionId: session.id,
          terminalHandle: session.terminalHandle,
          title: pane.title
        }
      }
      case 'command':
      case 'shell': {
        const result = await this.runtime.launchWorkbenchTerminal(
          worktreeId,
          pane.title,
          pane.kind === 'command' ? pane.command : undefined
        )
        return {
          sessionId: null,
          terminalHandle: result.terminalHandle,
          title: pane.title
        }
      }
    }
  }
}
