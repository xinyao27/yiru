import { MenuView, type MenuAction } from '@expo/ui/community/menu'
import { View } from 'react-native'

import { MobileGlassSurface } from '../components/glass/surface'
import { LoadingIndicator } from '../components/loading-indicator'
import { Plus } from '../components/uniwind-icons'
import { cn } from '../style/class-names'
import type { MobileImageSource } from './image-source-picker'

const ATTACHMENT_ACTIONS = [
  { id: 'camera', title: 'Camera', image: 'camera' },
  { id: 'library', title: 'Photos', image: 'photo.on.rectangle' },
  { id: 'files', title: 'Files', image: 'folder' }
] satisfies MenuAction[]

type MobileAttachmentMenuProps = {
  disabled: boolean
  pending: boolean
  onSelect: (source: MobileImageSource) => void
}

function getAttachmentSource(actionId: string): MobileImageSource | null {
  if (actionId === 'camera' || actionId === 'library' || actionId === 'files') {
    return actionId
  }
  return null
}

export function MobileAttachmentMenu({
  disabled,
  pending,
  onSelect
}: MobileAttachmentMenuProps): React.JSX.Element {
  const trigger = (
    <MobileGlassSurface
      className={cn('h-10 w-10 overflow-hidden rounded-full', disabled && 'opacity-40')}
      isInteractive={!disabled}
      tintColorClassName="accent-secondary"
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={pending ? 'Adding attachment' : 'Add attachment'}
        accessibilityState={{ disabled }}
        className="h-full w-full items-center justify-center rounded-full"
      >
        {pending ? (
          <LoadingIndicator size={20} />
        ) : (
          <Plus size={22} colorClassName="accent-muted-foreground" />
        )}
      </View>
    </MobileGlassSurface>
  )

  if (disabled) {
    return trigger
  }

  return (
    <MenuView
      actions={ATTACHMENT_ACTIONS}
      onPressAction={(event) => {
        const source = getAttachmentSource(event.nativeEvent.event)
        if (source) {
          onSelect(source)
        }
      }}
    >
      {trigger}
    </MenuView>
  )
}
