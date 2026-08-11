import type React from 'react'
import { createPortal } from 'react-dom'

import TabBar from '../tab-bar/tab-bar'

type TitlebarTabBarPortalProps = React.ComponentProps<typeof TabBar> & {
  target: HTMLElement
}

// Why: the TabBar renders into the titlebar via a portal so tabs share the
// same row as the "Yiru" title. The target element is created by
// application-shell.tsx. This is only a fallback before a worktree's
// root-group layout is established — once split groups are enabled, each
// group owns its own tab strip inline.
export function TitlebarTabBarPortal({
  target,
  ...tabBarProps
}: TitlebarTabBarPortalProps): React.JSX.Element {
  return createPortal(<TabBar {...tabBarProps} />, target)
}
