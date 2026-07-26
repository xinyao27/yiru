import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { X } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from '../components/bottom-drawer'
import { MobileSyntaxSegments } from '../components/syntax-segments'
import { mobileDiffLineNumber, mobileDiffLinePrefix } from './diff-format'
import type { MobileBranchDiffPreviewState } from './screen-state'
import { styles } from './styles'

type Props = {
  branchDiffPreview: MobileBranchDiffPreviewState | null
  onClose: () => void
}

export function MobileBranchDiffPreviewDrawer({ branchDiffPreview, onClose }: Props) {
  if (!branchDiffPreview) {
    return null
  }
  const entry = branchDiffPreview.entry
  return (
    <BottomDrawer
      visible={branchDiffPreview !== null}
      onClose={onClose}
      dragContentToDismiss={false}
      zIndex={1100}
    >
      <View className="border-b-hairline border-b-border flex-row items-center gap-3 pb-3">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-bold" numberOfLines={1}>
            {entry.path}
          </Text>
          <Text className="text-muted-foreground/60 mt-[2px] text-xs" numberOfLines={1}>
            {branchDiffPreview.kind === 'ready'
              ? `${branchDiffPreview.summary.baseRef}..HEAD`
              : 'Committed on branch'}
          </Text>
        </View>
        <Pressable
          className={cn('w-[34px] h-[34px] items-center justify-center', 'active:bg-accent')}
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Close committed diff preview"
        >
          <X size={18} colorClassName="accent-muted-foreground" />
        </Pressable>
      </View>
      {branchDiffPreview.kind === 'loading' ? (
        <View className={styles.diffState}>
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        </View>
      ) : branchDiffPreview.kind === 'error' ? (
        <View className={styles.diffState}>
          <Text className={styles.stateTitle}>Unable to Load Diff</Text>
          <Text className={styles.stateText}>{branchDiffPreview.message}</Text>
        </View>
      ) : (
        <View className="pt-3 pb-4">
          {branchDiffPreview.truncated ? (
            <Text className="text-muted-foreground/60 mb-2 text-xs">
              Diff truncated for mobile preview.
            </Text>
          ) : null}
          {branchDiffPreview.lines.map((line, index) => (
            <View
              key={`${index}:${line.kind}:${line.oldLineNumber ?? ''}:${line.newLineNumber ?? ''}`}
              className={cn(
                'flex-row items-start gap-1 py-[2px] px-1',
                line.kind === 'add' && 'bg-[var(--editor-diff-inserted-line-background)]',
                line.kind === 'delete' && 'bg-[var(--editor-diff-removed-line-background)]'
              )}
            >
              <Text className="text-muted-foreground/60 w-10 text-right font-mono text-xs">
                {mobileDiffLineNumber(line)}
              </Text>
              <Text className="text-muted-foreground w-3 font-mono text-xs">
                {mobileDiffLinePrefix(line.kind)}
              </Text>
              <Text className="text-foreground flex-1 font-mono text-xs leading-[17px]">
                {line.text ? <MobileSyntaxSegments segments={line.segments} /> : ' '}
              </Text>
            </View>
          ))}
        </View>
      )}
    </BottomDrawer>
  )
}
