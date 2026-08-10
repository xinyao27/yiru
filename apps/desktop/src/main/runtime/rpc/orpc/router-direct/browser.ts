import { browserControlLeaves } from './browser-control'
import { browserInspectionLeaves } from './browser-inspection'
import { browserInteractionLeaves } from './browser-interaction'
import { browserNavigationLeaves } from './browser-navigation'
import { browserNetworkLeaves } from './browser-network'
import { browserProfileLeaves } from './browser-profiles'
import { browserStreamLeaves } from './browser-streams'

// Why: `browser` is 95 leaves under one top-level contract key — far past what the
// 300-line cap allows in a single router-direct file (docs/runtime-orpc-migration.md
// Phase 6, 切片 78). Unlike `git`/`github`/`gitlab` (三个各自的顶层 key,各自成文件),
// every leaf here shares the single `browser` key, and router-direct.ts's plain object
// spread would let a second `browser: {...}` sibling silently clobber this one instead
// of merging (切片 72's `files.ts` hit the same trap). So the split happens one level
// down: each sibling file exports a plain leaf-object builder (not wrapped in
// `browser:`), and this file is the only place that assembles them under the one
// `browser` key. Add a new browser leaf to the feature-area file it belongs with
// (navigation, interaction, inspection, network/session-control, profiles, streams);
// never spread a second `browser: {...}` object anywhere else.
export const browserRuntimeHandlers = {
  browser: {
    ...browserControlLeaves(),
    ...browserNavigationLeaves(),
    ...browserInteractionLeaves(),
    ...browserInspectionLeaves(),
    ...browserNetworkLeaves(),
    ...browserProfileLeaves(),
    ...browserStreamLeaves()
  }
} as const
