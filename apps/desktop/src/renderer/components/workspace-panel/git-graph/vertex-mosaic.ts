import { GIT_GRAPH_PIXEL_SIZE } from './layout-path'

// Why: commit dots are block mosaics rather than circles — cut corners fake
// roundness the way a sprite does, so a node reads as pixel art instead of a
// smooth shape antialiasing against the staircase lines feeding into it.
// Every block is one lattice cell, and every mosaic has even side lengths so
// it stays centred on the lane's even pixel coordinate.
export type GitGraphVertexKind = 'commit' | 'current-head' | 'uncommitted'

const COMMIT_MOSAIC = ['.##.', '####', '####', '.##.']

// Why: the checked-out commit gets a ringed sprite instead of a heavier
// stroke — the hole reads as "you are here" at 12px where a thicker outline
// would just look like a bigger dot.
const CURRENT_HEAD_MOSAIC = ['.####.', '#....#', '#.##.#', '#.##.#', '#....#', '.####.']

const UNCOMMITTED_MOSAIC = ['.##.', '#..#', '#..#', '.##.']

function vertexMosaic(kind: GitGraphVertexKind): readonly string[] {
  switch (kind) {
    case 'commit':
      return COMMIT_MOSAIC
    case 'current-head':
      return CURRENT_HEAD_MOSAIC
    case 'uncommitted':
      return UNCOMMITTED_MOSAIC
  }
}

// Why: one <path> of block subpaths per node keeps the sprite a single element
// — a <rect> per lit block would multiply the DOM by ~12 on every commit row.
export function gitGraphVertexPath(
  centerX: number,
  centerY: number,
  kind: GitGraphVertexKind
): string {
  const mosaic = vertexMosaic(kind)
  const block = GIT_GRAPH_PIXEL_SIZE
  const columnCount = mosaic[0]?.length ?? 0
  const originX = centerX - (columnCount * block) / 2
  const originY = centerY - (mosaic.length * block) / 2

  let path = ''
  mosaic.forEach((row, rowIndex) => {
    for (let column = 0; column < row.length; column++) {
      if (row[column] !== '#') {
        continue
      }
      const x = originX + column * block
      const y = originY + rowIndex * block
      path += `M${x},${y}h${block}v${block}h${-block}Z`
    }
  })
  return path
}
