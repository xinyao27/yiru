import { Host } from '@expo/ui/swift-ui'
import type { ComponentProps } from 'react'
import { useUniwind } from 'uniwind'

import { MobileAttachmentMenu } from '../attachment-menu'

type MobileTerminalAttachmentMenuProps = ComponentProps<typeof MobileAttachmentMenu>

export function MobileTerminalAttachmentMenu(
  props: MobileTerminalAttachmentMenuProps
): React.JSX.Element {
  const { theme } = useUniwind()

  return (
    <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
      <MobileAttachmentMenu {...props} />
    </Host>
  )
}
