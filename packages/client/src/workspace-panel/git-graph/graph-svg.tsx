import type React from 'react'

import {
  GIT_GRAPH_DEFAULT_GRID,
  GIT_GRAPH_PIXEL_SIZE,
  type GitGraphGrid,
  type GitGraphLayout,
  type GitGraphRowGap
} from './layout'
import { GIT_GRAPH_COLORS } from './palette'
import { gitGraphVertexPath } from './vertex-mosaic'

const MUTED_OPACITY = 0.5
const DEFAULT_STROKE_WIDTH = GIT_GRAPH_PIXEL_SIZE

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
  // Why: lane colours are design-system `var()` references, so the surface
  // follows the theme through CSS — no store read, no re-render on theme flip.
  const colors = GIT_GRAPH_COLORS

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
      shapeRendering="crispEdges"
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
          strokeLinecap="butt"
          strokeWidth={DEFAULT_STROKE_WIDTH}
        />
      ))}
      {layout.vertices.map((vertex) => {
        const cx = grid.offsetX + vertex.column * grid.x
        const cy = rowY(vertex.row)
        const color = colors[vertex.colorIndex % colors.length]
        return (
          <path
            key={vertex.commitId}
            d={gitGraphVertexPath(cx, cy, vertex.isCurrentHead ? 'current-head' : 'commit')}
            fill={color}
            opacity={isMuted(vertex.commitId) ? MUTED_OPACITY : 1}
          />
        )
      })}
    </svg>
  )
}
