import { Text } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { ArrowDown, ArrowUp, type Icon } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { MobileDiffReviewHunkNavigationProps } from './hunk-navigation-props'

function HunkButton({
  direction,
  disabled,
  icon: Icon,
  onJumpHunk
}: MobileDiffReviewHunkNavigationProps & {
  direction: 'next' | 'previous'
  icon: Icon
}): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={
        direction === 'previous'
          ? translate('mobile.review.hunks.previous', 'Previous hunk')
          : translate('mobile.review.hunks.next', 'Next hunk')
      }
      accessibilityRole="button"
      className="rounded-full"
      contentClassName="flex-row items-center justify-center gap-1 rounded-full px-3"
      disabled={disabled}
      fallbackClassName="bg-card"
      onPress={() => onJumpHunk(direction)}
      size="small"
    >
      <Icon size={16} colorClassName="accent-muted-foreground" />
      <Text className="text-muted-foreground text-sm">
        {translate('mobile.review.hunks.label', 'Hunk')}
      </Text>
    </MobileGlassPressable>
  )
}

export function MobileDiffReviewHunkNavigation({
  disabled,
  onJumpHunk
}: MobileDiffReviewHunkNavigationProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="mt-2 flex-row gap-2" spacing={8}>
      <HunkButton direction="previous" disabled={disabled} icon={ArrowUp} onJumpHunk={onJumpHunk} />
      <HunkButton direction="next" disabled={disabled} icon={ArrowDown} onJumpHunk={onJumpHunk} />
    </MobileGlassGroup>
  )
}
