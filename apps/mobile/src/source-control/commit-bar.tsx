import { ActivityIndicator, Text, TextInput, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileGlassSurface } from '~/components/glass/surface'
import { Sparkle as Sparkles } from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import type { MobileSourceControlCommitBarProps } from './commit-bar-props'

export function MobileSourceControlCommitBar({
  commitMessage,
  generateDisabled,
  generatingMessage,
  hasStagedFiles,
  inputDisabled,
  isCreatePrAction,
  onChangeText,
  onGenerate,
  onPrimaryAction,
  primaryAccessibilityHint,
  primaryAccessibilityLabel,
  primaryDisabled,
  primaryLabel,
  primaryLoading,
  showGenerateButton
}: MobileSourceControlCommitBarProps): React.JSX.Element {
  const isPrimaryProminent = !primaryDisabled && !isCreatePrAction

  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      <MobileGlassSurface
        className="min-h-11 flex-1 overflow-hidden rounded-full"
        fallbackClassName="bg-secondary"
        isFunctional
        isInteractive={hasStagedFiles}
        tintColorClassName="accent-accent"
      >
        {hasStagedFiles ? (
          <TextInput
            className="text-foreground min-h-11 flex-1 px-4 text-sm"
            editable={!inputDisabled}
            onChangeText={onChangeText}
            onSubmitEditing={onPrimaryAction}
            placeholder="Commit message"
            placeholderTextColorClassName="accent-muted-foreground"
            returnKeyType="done"
            value={commitMessage}
          />
        ) : (
          <View
            accessibilityLabel="Commit message disabled. No staged files."
            accessibilityRole="text"
            accessibilityState={{ disabled: true }}
            className="min-h-11 flex-1 items-center justify-center rounded-full px-4"
          >
            <Text className="text-muted-foreground text-sm">No staged files</Text>
          </View>
        )}
      </MobileGlassSurface>
      <MobileGlassPressable
        accessibilityHint={primaryAccessibilityHint}
        accessibilityLabel={primaryAccessibilityLabel}
        className="min-h-11 min-w-24 rounded-full"
        contentClassName="min-h-11 min-w-24 items-center justify-center rounded-full px-4"
        disabled={primaryDisabled}
        fallbackClassName={isPrimaryProminent ? 'border-transparent bg-primary' : 'bg-secondary'}
        onPress={onPrimaryAction}
        tintColorClassName={isPrimaryProminent ? 'accent-primary' : 'accent-accent'}
      >
        {primaryLoading ? (
          <ActivityIndicator
            size="small"
            colorClassName={
              isPrimaryProminent ? 'accent-primary-foreground' : 'accent-muted-foreground'
            }
          />
        ) : (
          <Text
            className={cn(
              'text-sm font-semibold',
              isPrimaryProminent ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {primaryLabel}
          </Text>
        )}
      </MobileGlassPressable>
      {showGenerateButton ? (
        <MobileGlassPressable
          accessibilityLabel={
            generatingMessage
              ? 'Cancel commit message generation'
              : 'Generate commit message with AI'
          }
          className="h-11 w-11 rounded-full"
          contentClassName="h-full w-full items-center justify-center rounded-full"
          disabled={generateDisabled}
          fallbackClassName="bg-secondary"
          hitSlop={4}
          onPress={onGenerate}
          tintColorClassName="accent-accent"
        >
          {generatingMessage ? (
            <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          ) : (
            <Sparkles size={16} colorClassName="accent-muted-foreground" />
          )}
        </MobileGlassPressable>
      ) : null}
    </MobileGlassGroup>
  )
}
