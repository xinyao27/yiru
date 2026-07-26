import { ActivityIndicator, Pressable } from 'react-native'

import { ImageSquare as ImagePlus } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'

type MobileTerminalInputActionsProps = {
  readonly canSend: boolean
  readonly isAttaching: boolean
  readonly buttonClassName: string
  readonly disabledButtonClassName: string
  readonly onAttachImage: () => void
  readonly onAttachFile: () => void
}

// Why: sharing this control keeps live and buffered attachment behavior identical.
export function MobileTerminalInputActions({
  canSend,
  isAttaching,
  buttonClassName,
  disabledButtonClassName,
  onAttachImage,
  onAttachFile
}: MobileTerminalInputActionsProps) {
  return (
    <Pressable
      className={cn(buttonClassName, (!canSend || isAttaching) && disabledButtonClassName)}
      disabled={!canSend || isAttaching}
      // Why: both pickers upload through the host RPC, so remote sessions behave like local ones.
      onPress={onAttachImage}
      onLongPress={onAttachFile}
      delayLongPress={350}
      accessibilityLabel={isAttaching ? 'Sending image' : 'Attach a photo'}
      accessibilityHint="Long press to attach a file instead"
    >
      {isAttaching ? (
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      ) : (
        <ImagePlus size={17} colorClassName="accent-muted-foreground" />
      )}
    </Pressable>
  )
}
