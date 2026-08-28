import type React from 'react'

// Why: rows own their horizontal inset and card spacing; the virtualizer stays flush.
export const WORKTREE_SIDEBAR_CONTENT_STYLE: React.CSSProperties = {
  gap: 0,
  paddingTop: 1
}

export const WORKTREE_SIDEBAR_SCROLL_STYLE: React.CSSProperties = {
  height: '100%',
  overflowX: 'hidden',
  overflowAnchor: 'none'
}
