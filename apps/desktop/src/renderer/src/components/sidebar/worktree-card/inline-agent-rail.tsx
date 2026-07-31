import type React from 'react'

import {
  WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX,
  WORKTREE_CARD_STATUS_SLOT_WIDTH
} from '../worktree-list-indentation'

type InlineAgentRailProps = {
  /** The card's own padding-left, so the rail can offset from the status column. */
  cardPaddingLeft: string
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

/**
 * The tree line joining a workspace's status glyph to its inline agent rows:
 * one vertical run down the status column, turning into the last row's glyph.
 */
export function InlineAgentRail(props: InlineAgentRailProps): React.JSX.Element {
  const { cardPaddingLeft } = props
  const left = `calc(${cardPaddingLeft} + ${STATUS_ICON_CENTER_LEFT_PX}px)`

  return (
    <>
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 w-px"
        style={{
          left,
          top: RAIL_TOP_PX,
          bottom: LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX
        }}
      />
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 h-px"
        style={{
          left,
          bottom: LAST_AGENT_ROW_CENTER_FROM_BOTTOM_PX,
          width: RAIL_ELBOW_WIDTH_PX
        }}
      />
    </>
  )
}
