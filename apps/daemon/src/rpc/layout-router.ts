import type { LayoutService } from '../layouts/service'
import { daemonImplementation } from './contract'
import { withRevisionConflict } from './revision-conflict'

export function createLayoutRouter(layouts: LayoutService) {
  return {
    apply: daemonImplementation.layout.apply.handler(({ input }) =>
      withRevisionConflict(() => layouts.apply(input))
    ),
    list: daemonImplementation.layout.list.handler(async ({ input }) => ({
      recipes: await layouts.list(input.worktree)
    }))
  }
}
