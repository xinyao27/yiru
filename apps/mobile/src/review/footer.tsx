import { Text, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import {
  Check,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  FileText,
  Plus,
  Trash as Trash2,
  ArrowCounterClockwise as Undo2,
  type Icon
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'

import type { MobileDiffReviewFooterProps } from './footer-props'

type ReviewFooterButtonProps = {
  accessibilityLabel: string
  destructive?: boolean
  disabled?: boolean
  grow?: boolean
  icon: Icon
  label?: string
  onPress: () => void
  prominent?: boolean
}

function ReviewFooterButton({
  accessibilityLabel,
  destructive = false,
  disabled = false,
  grow = false,
  icon: Icon,
  label,
  onPress,
  prominent = false
}: ReviewFooterButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={cn('rounded-full', grow && 'w-full')}
      containerClassName={grow ? 'flex-1' : undefined}
      contentClassName={cn(
        'flex-row items-center justify-center rounded-full',
        label ? 'gap-1 px-3' : 'w-11'
      )}
      disabled={disabled}
      fallbackClassName={prominent ? 'border-transparent bg-primary' : 'bg-secondary'}
      onPress={onPress}
      size="regular"
      tintColorClassName={prominent ? 'accent-primary' : undefined}
    >
      <Icon
        size={label ? 16 : 18}
        colorClassName={
          prominent
            ? 'accent-primary-foreground'
            : destructive
              ? 'accent-destructive'
              : 'accent-foreground'
        }
      />
      {label ? (
        <Text
          className={cn(
            'text-sm',
            prominent
              ? 'text-primary-foreground font-semibold'
              : destructive
                ? 'text-destructive'
                : 'text-foreground'
          )}
        >
          {label}
        </Text>
      ) : null}
    </MobileGlassPressable>
  )
}

export function MobileDiffReviewFooter({
  busyAction,
  item,
  onAddFileNote,
  onDiscard,
  onGitMutation,
  onMarkReviewed,
  onMoveFile
}: MobileDiffReviewFooterProps): React.JSX.Element {
  const hasGitActions = item.canStage || item.canUnstage || item.canDiscard
  return (
    <View className="pb-safe-offset-2 absolute right-0 bottom-0 left-0 px-3 pt-2">
      <MobileGlassGroup className="gap-2" spacing={8}>
        {hasGitActions ? (
          <View className="flex-row gap-2">
            {item.canStage ? (
              <ReviewFooterButton
                accessibilityLabel={translate('mobile.review.footer.stageFile', 'Stage file')}
                disabled={busyAction !== null}
                grow
                icon={Plus}
                label={translate('mobile.review.footer.stage', 'Stage')}
                onPress={() => onGitMutation('git.stage', item)}
              />
            ) : null}
            {item.canUnstage ? (
              <ReviewFooterButton
                accessibilityLabel={translate('mobile.review.footer.unstageFile', 'Unstage file')}
                disabled={busyAction !== null}
                grow
                icon={Undo2}
                label={translate('mobile.review.footer.unstage', 'Unstage')}
                onPress={() => onGitMutation('git.unstage', item)}
              />
            ) : null}
            {item.canDiscard ? (
              <ReviewFooterButton
                accessibilityLabel={translate('mobile.review.footer.discardFile', 'Discard file')}
                destructive
                disabled={busyAction !== null}
                grow
                icon={Trash2}
                label={translate('mobile.review.footer.discard', 'Discard')}
                onPress={() => onDiscard(item)}
              />
            ) : null}
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <ReviewFooterButton
            accessibilityLabel={translate('mobile.review.footer.previousFile', 'Previous file')}
            icon={ChevronLeft}
            onPress={() => onMoveFile('previous')}
          />
          <ReviewFooterButton
            accessibilityLabel={translate('mobile.review.footer.addFileNote', 'Add file note')}
            icon={FileText}
            label={translate('mobile.review.footer.note', 'Note')}
            onPress={onAddFileNote}
          />
          <ReviewFooterButton
            accessibilityLabel={
              item.isReviewed
                ? translate('mobile.review.footer.reviewed', 'Reviewed')
                : translate('mobile.review.footer.markReviewed', 'Mark Reviewed')
            }
            grow
            icon={Check}
            label={
              item.isReviewed
                ? translate('mobile.review.footer.reviewed', 'Reviewed')
                : translate('mobile.review.footer.markReviewed', 'Mark Reviewed')
            }
            onPress={onMarkReviewed}
            prominent
          />
          <ReviewFooterButton
            accessibilityLabel={translate('mobile.review.footer.nextFile', 'Next file')}
            icon={ChevronRight}
            onPress={() => onMoveFile('next')}
          />
        </View>
      </MobileGlassGroup>
    </View>
  )
}
