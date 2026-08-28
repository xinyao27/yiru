import React from 'react'

import type { TabBarProps } from './tab-bar-types'
import { TabCreateMenu } from './tab-create-menu'
import { TabStrip } from './tab-strip'

function TabBarInner(props: TabBarProps): React.JSX.Element {
  return (
    <div
      className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden"
      // Why: native OS drops aimed at the session strip open in the editor;
      // terminal-pane drops still insert paths into the active coding CLI.
      data-native-file-drop-target="editor"
    >
      <TabStrip {...props} />
      <TabCreateMenu {...props} />
    </div>
  )
}

export default TabBarInner
