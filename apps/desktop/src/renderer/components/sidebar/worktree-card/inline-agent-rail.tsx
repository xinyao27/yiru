import React from 'react'

import {
  WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX,
  WORKTREE_CARD_STATUS_SLOT_WIDTH
} from '../worktree-list-indentation'

type InlineAgentRailProps = {
  /** The card's own padding-left, so the rail can offset from the status column. */
  cardPaddingLeft: string
  /** Why: visible row totals keep every root elbow aligned while a subtree folds. */
  rootRowVisibleCounts: readonly number[]
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

/** Each root agent row's glyph-centre distance from the card's bottom edge. */
function getRootRowCentersFromBottom(rootRowVisibleCounts: readonly number[]): number[] {
  const totalRenderedRows = rootRowVisibleCounts.reduce((total, count) => total + count, 0)

  let rowsAbove = 0
  return rootRowVisibleCounts.map((renderedRowCount) => {
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
  const { cardPaddingLeft, rootRowVisibleCounts } = props
  const left = `calc(${cardPaddingLeft} + ${STATUS_ICON_CENTER_LEFT_PX}px)`
  const rootRowCentersFromBottom = React.useMemo(
    () => getRootRowCentersFromBottom(rootRowVisibleCounts),
    [rootRowVisibleCounts]
  )
  const lastRootRowCenterFromBottom =
    rootRowCentersFromBottom.at(-1) ?? LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX

  return (
    <>
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 w-px transition-[bottom] duration-150 ease-out motion-reduce:transition-none"
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
          className="bg-sidebar-border pointer-events-none absolute z-10 h-px transition-[bottom] duration-150 ease-out motion-reduce:transition-none"
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
