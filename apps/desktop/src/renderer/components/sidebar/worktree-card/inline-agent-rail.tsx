import React from 'react'
import { buildAgentRowLineageTree } from '~renderer/components/dashboard/agent-row-lineage-model'
import type { DashboardAgentRow } from '~renderer/components/dashboard/use-dashboard-data'

import {
  WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX,
  WORKTREE_CARD_STATUS_SLOT_WIDTH
} from '../worktree-list-indentation'

type InlineAgentRailProps = {
  /** The card's own padding-left, so the rail can offset from the status column. */
  cardPaddingLeft: string
  /** The rows the inline list renders, so the rail can tick each root agent. */
  agents: readonly DashboardAgentRow[]
}

// Why: absolute children are placed against the card's padding box, so every
// offset here is measured from inside the border and adds the card padding back.
const STATUS_ICON_CENTER_LEFT_PX =
  WORKTREE_CARD_STATUS_SLOT_WIDTH / 2 + WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX
// Why: cards showing agents always render at 'details' density (`pt-1.25`), so
// the status glyph centre is that padding plus half the status slot.
const STATUS_ICON_CENTER_TOP_PX = 5 + WORKTREE_CARD_STATUS_SLOT_WIDTH / 2
// Why: both the workspace status glyph and the agent glyphs are 13px artwork.
const GLYPH_RADIUS_PX = 13 / 2
// Why: the agent list is the last thing in the card, and every compact row is a
// fixed 24px (`h-6`), so the bottom row's glyph centre is the card's `pb-1.5`
// plus half a row up from the padding box's bottom edge. Anchoring to the bottom
// keeps the rail correct however much card body sits above the list.
const LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX = 6 + 12
// Why: the list only outdents by its rows' own `px-1` (`-ms-1`), so agent glyphs
// align with the title text: status slot + slot margin + content-row gap - 4.
const INLINE_AGENT_LIST_LEFT_PX = WORKTREE_CARD_STATUS_SLOT_WIDTH + 4 + 2 - 4
// Why: compact rows pad by `px-1`, so that is where the agent glyph starts.
const AGENT_ROW_ICON_LEFT_FROM_LIST_LEFT_PX = 4
// Why: the rail points at a glyph rather than touching it — running into the
// artwork reads as a line crossing the icon instead of leading to it. The same
// gap applies at both ends, so the corner reads as one consistent inset.
const RAIL_ICON_GAP_PX = 6
const RAIL_TOP_PX = STATUS_ICON_CENTER_TOP_PX + GLYPH_RADIUS_PX + RAIL_ICON_GAP_PX
const RAIL_ELBOW_WIDTH_PX =
  INLINE_AGENT_LIST_LEFT_PX +
  AGENT_ROW_ICON_LEFT_FROM_LIST_LEFT_PX -
  STATUS_ICON_CENTER_LEFT_PX -
  RAIL_ICON_GAP_PX

// Why: compact rows are a fixed `h-6` and stack flush, so a row's centre is a
// pure function of how many rows the list renders below it.
const COMPACT_AGENT_ROW_HEIGHT_PX = 24

// Why: mirrors the pre-order walk (and the cycle guard) that agents.tsx renders
// for compact branches — descendants are always laid out, never collapsed — so
// the rail counts exactly the rows that end up on screen.
function countRenderedRows(
  paneKey: string,
  childrenByParentPaneKey: ReadonlyMap<string, readonly DashboardAgentRow[]>,
  ancestorPaneKeys: ReadonlySet<string>
): number {
  if (ancestorPaneKeys.has(paneKey)) {
    return 0
  }
  const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
  descendantAncestorPaneKeys.add(paneKey)

  let renderedRows = 1
  for (const child of childrenByParentPaneKey.get(paneKey) ?? []) {
    renderedRows += countRenderedRows(
      child.paneKey,
      childrenByParentPaneKey,
      descendantAncestorPaneKeys
    )
  }
  return renderedRows
}

/** Each root agent row's glyph-centre distance from the card's bottom edge. */
function getRootRowCentersFromBottom(agents: readonly DashboardAgentRow[]): number[] {
  const { rootRows, childrenByParentPaneKey } = buildAgentRowLineageTree(agents)
  const renderedRowCounts = rootRows.map((rootRow) =>
    countRenderedRows(rootRow.paneKey, childrenByParentPaneKey, new Set())
  )
  const totalRenderedRows = renderedRowCounts.reduce((total, count) => total + count, 0)

  let rowsAbove = 0
  return renderedRowCounts.map((renderedRowCount) => {
    const rowsBelow = totalRenderedRows - rowsAbove - 1
    rowsAbove += renderedRowCount
    return LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX + rowsBelow * COMPACT_AGENT_ROW_HEIGHT_PX
  })
}

/**
 * The tree line joining a workspace's status glyph to its inline agent rows: one
 * vertical run down the status column, turning into every root agent's glyph and
 * stopping at the last of them.
 */
export function InlineAgentRail(props: InlineAgentRailProps): React.JSX.Element {
  const { cardPaddingLeft, agents } = props
  const left = `calc(${cardPaddingLeft} + ${STATUS_ICON_CENTER_LEFT_PX}px)`
  const rootRowCentersFromBottom = React.useMemo(
    () => getRootRowCentersFromBottom(agents),
    [agents]
  )
  const lastRootRowCenterFromBottom =
    rootRowCentersFromBottom.at(-1) ?? LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX

  return (
    <>
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 w-px"
        style={{
          left,
          top: RAIL_TOP_PX,
          bottom: lastRootRowCenterFromBottom
        }}
      />
      {rootRowCentersFromBottom.map((centerFromBottom) => (
        <span
          key={centerFromBottom}
          aria-hidden="true"
          className="bg-sidebar-border pointer-events-none absolute z-10 h-px"
          style={{
            left,
            bottom: centerFromBottom,
            width: RAIL_ELBOW_WIDTH_PX
          }}
        />
      ))}
    </>
  )
}
