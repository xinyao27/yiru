import type { HostMenuProps } from './host-menu'

export function HostMenu(props: HostMenuProps): React.JSX.Element {
  return props.children({
    onLongPress: props.onOpenFallback,
    onMoreActions: props.onOpenFallback
  })
}
