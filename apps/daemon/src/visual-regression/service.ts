import type { VisualRegressionCapture } from '@yiru/runtime-protocol/contract'

import type { WorkspacePortService } from '../ports/service'
import type { VisualRegressionStore } from './store'

export type VisualRegressionIdentity = {
  pageUrl: string
  projectId: string
  worktreeId: string
}

export class VisualRegressionService {
  private readonly ports: WorkspacePortService
  private readonly store: VisualRegressionStore

  constructor(store: VisualRegressionStore, ports: WorkspacePortService) {
    this.store = store
    this.ports = ports
  }

  async latest(identity: VisualRegressionIdentity): Promise<VisualRegressionCapture | null> {
    await this.requireIdentity(identity)
    return this.store.latest(identity.projectId, identity.worktreeId)
  }

  async save(
    input: Omit<VisualRegressionCapture, 'createdAt' | 'id'>
  ): Promise<VisualRegressionCapture> {
    await this.requireIdentity(input)
    return this.store.save(input)
  }

  private async requireIdentity(identity: VisualRegressionIdentity): Promise<void> {
    const page = new URL(identity.pageUrl)
    const port = page.port ? Number(page.port) : page.protocol === 'https:' ? 443 : 80
    if (
      !['http:', 'https:'].includes(page.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(page.hostname.toLowerCase())
    ) {
      throw new Error('visual_capture_requires_local_preview')
    }
    const observed = await this.ports.scan({ repoId: identity.projectId })
    const isExact = observed.ports.some(
      (candidate) =>
        candidate.kind === 'workspace' &&
        candidate.port === port &&
        candidate.owner.repoId === identity.projectId &&
        candidate.owner.worktreeId === identity.worktreeId
    )
    if (!isExact) {
      throw new Error('visual_capture_workspace_identity_mismatch')
    }
  }
}
