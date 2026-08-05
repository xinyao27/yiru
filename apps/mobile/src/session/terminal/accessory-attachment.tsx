import type { ComponentProps } from 'react'

import { MobileAttachmentMenu } from '../attachment-menu'

type MobileTerminalAttachmentMenuProps = ComponentProps<typeof MobileAttachmentMenu>

export function MobileTerminalAttachmentMenu(
  props: MobileTerminalAttachmentMenuProps
): React.JSX.Element {
  return <MobileAttachmentMenu {...props} />
}
