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
      className={cn('rounded-full', grow && 'flex-1')}
      contentClassName={cn(
        'min-h-9 flex-row items-center justify-center rounded-full',
        label ? 'gap-1 px-3' : 'w-9'
      )}
      disabled={disabled}
      fallbackClassName={prominent ? 'border-transparent bg-primary' : 'bg-secondary'}
      hitSlop={label ? 4 : 8}
      onPress={onPress}
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
                accessibilityLabel="Stage file"
                disabled={busyAction !== null}
                grow
                icon={Plus}
                label="Stage"
                onPress={() => onGitMutation('git.stage', item)}
              />
            ) : null}
            {item.canUnstage ? (
              <ReviewFooterButton
                accessibilityLabel="Unstage file"
                disabled={busyAction !== null}
                grow
                icon={Undo2}
                label="Unstage"
                onPress={() => onGitMutation('git.unstage', item)}
              />
            ) : null}
            {item.canDiscard ? (
              <ReviewFooterButton
                accessibilityLabel="Discard file"
                destructive
                disabled={busyAction !== null}
                grow
                icon={Trash2}
                label="Discard"
                onPress={() => onDiscard(item)}
              />
            ) : null}
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <ReviewFooterButton
            accessibilityLabel="Previous file"
            icon={ChevronLeft}
            onPress={() => onMoveFile('previous')}
          />
          <ReviewFooterButton
            accessibilityLabel="Add file note"
            icon={FileText}
            label="Note"
            onPress={onAddFileNote}
          />
          <ReviewFooterButton
            accessibilityLabel="Mark file reviewed"
            grow
            icon={Check}
            label={item.isReviewed ? 'Reviewed' : 'Mark Reviewed'}
            onPress={onMarkReviewed}
            prominent
          />
          <ReviewFooterButton
            accessibilityLabel="Next file"
            icon={ChevronRight}
            onPress={() => onMoveFile('next')}
          />
        </View>
      </MobileGlassGroup>
    </View>
  )
}
