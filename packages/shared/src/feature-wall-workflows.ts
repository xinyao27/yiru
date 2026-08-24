import type { FeatureWallTileIdTelemetry } from './telemetry-events'

export type FeatureWallWorkflowId = 'workspaces' | 'agents-orchestration' | 'workbench' | 'review'

export type FeatureWallWorkflow = {
  id: FeatureWallWorkflowId
  title: string
  lede: string
  telemetryTileId: FeatureWallTileIdTelemetry
}

export const FEATURE_WALL_WORKFLOWS: readonly FeatureWallWorkflow[] = [
  {
    id: 'workspaces',
    title: 'Workspaces',
    lede: 'Yiru splits each task into an isolated workspace so agents can run in parallel.',
    telemetryTileId: 'tile-01'
  },
  {
    id: 'agents-orchestration',
    title: 'Agents',
    lede: 'Run several agents at once and track their progress across independent workspaces.',
    telemetryTileId: 'tile-04'
  },
  {
    id: 'workbench',
    title: 'Workbench',
    lede: 'Bring your terminal setup into Yiru, then split panes to keep servers, tests, logs, and agents running side by side.',
    telemetryTileId: 'tile-02'
  },
  {
    id: 'review',
    title: 'Code Review',
    lede: 'Review what changed, leave focused feedback, and send it back to the agent.',
    telemetryTileId: 'tile-08'
  }
] as const

export const FEATURE_WALL_WORKFLOW_IDS = FEATURE_WALL_WORKFLOWS.map(
  (w) => w.id
) as readonly FeatureWallWorkflowId[]

export const DEFAULT_FEATURE_WALL_WORKFLOW_ID: FeatureWallWorkflowId = 'workspaces'
