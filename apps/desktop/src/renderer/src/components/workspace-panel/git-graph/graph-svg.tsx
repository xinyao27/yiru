import type React from 'react'

import { resolveDocumentTheme } from '@/components/editor/document-theme'
import { useAppStore } from '@/store'

import {
  GIT_GRAPH_DEFAULT_GRID,
  GIT_GRAPH_VERTEX_RADIUS,
  type GitGraphGrid,
  type GitGraphLayout,
  type GitGraphRowGap
} from './layout'
import { gitGraphPalette } from './palette'

const MUTED_OPACITY = 0.5
// Why: the checked-out commit's line/vertex gets a heavier stroke to draw the
// eye to "where am I", matching vscode-git-graph's `.commit.current` rule.
const CURRENT_HEAD_STROKE_WIDTH = 2
const DEFAULT_STROKE_WIDTH = 1

export type GitGraphSvgProps = {
  layout: GitGraphLayout
  mutedCommitIds?: ReadonlySet<string>
  // Why: GitGraphLayout intentionally omits the grid it was built with (it is
  // not part of the layout contract), but this component must convert each
  // vertex's row/column back into pixels using that same grid to line up with
  // the pixel paths already baked into layout.edges. Callers that pass a
  // non-default grid to buildGitGraphLayout must pass the same grid here.
  grid?: GitGraphGrid
  // Why: must match the rowGap passed to buildGitGraphLayout so the vertex
  // circles this component draws from row/column stay aligned with the
  // gap-stretched edge paths already baked into layout.edges.
  rowGap?: GitGraphRowGap
}

export function GitGraphSvg({
  layout,
  mutedCommitIds,
  grid = GIT_GRAPH_DEFAULT_GRID,
  rowGap
}: GitGraphSvgProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const colors = gitGraphPalette(isDark)

  const rowCount = layout.vertices.reduce((max, vertex) => Math.max(max, vertex.row + 1), 0)
  const hasGapRows = rowGap !== undefined && rowCount - 1 > rowGap.afterRow
  const height =
    grid.offsetY * 2 + Math.max(0, rowCount - 1) * grid.y + (hasGapRows ? rowGap.height : 0)

  const isMuted = (commitId: string): boolean => mutedCommitIds?.has(commitId) ?? false
  const rowY = (row: number): number =>
    grid.offsetY + row * grid.y + (rowGap && row > rowGap.afterRow ? rowGap.height : 0)

  return (
    <svg
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      width={layout.width}
      height={height}
    >
      {layout.edges.map((edge) => (
        <path
          // Why: (fromCommitId, toCommitId) is not unique — octopus merges and
          // multiple off-page stubs can target the same sha — but each edge's
          // baked path is distinct pixel geometry, so pairing it with the
          // endpoints gives a stable, genuinely unique key without an index.
          key={`${edge.fromCommitId}-${edge.toCommitId}-${edge.path}`}
          d={edge.path}
          fill="none"
          opacity={isMuted(edge.fromCommitId) || isMuted(edge.toCommitId) ? MUTED_OPACITY : 1}
          stroke={colors[edge.colorIndex % colors.length]}
          strokeLinecap="round"
          strokeWidth={DEFAULT_STROKE_WIDTH}
        />
      ))}
      {layout.vertices.map((vertex) => {
        const cx = grid.offsetX + vertex.column * grid.x
        const cy = rowY(vertex.row)
        const color = colors[vertex.colorIndex % colors.length]
        return (
          <circle
            key={vertex.commitId}
            cx={cx}
            cy={cy}
            r={GIT_GRAPH_VERTEX_RADIUS}
            fill={color}
            opacity={isMuted(vertex.commitId) ? MUTED_OPACITY : 1}
            stroke={vertex.isCurrentHead ? color : undefined}
            strokeWidth={vertex.isCurrentHead ? CURRENT_HEAD_STROKE_WIDTH : undefined}
          />
        )
      })}
    </svg>
  )
}
