import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { X } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from '../components/bottom-drawer'
import { MobileSyntaxSegments } from '../components/mobile-syntax-segments'
import { mobileDiffLineNumber, mobileDiffLinePrefix } from './mobile-diff-format'
import type { MobileBranchDiffPreviewState } from './mobile-source-control-screen-state'
import { styles } from './mobile-source-control-styles'

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
      <View className={styles.diffDrawerHeader}>
        <View className={styles.diffDrawerTitleBlock}>
          <Text className={styles.diffDrawerTitle} numberOfLines={1}>
            {entry.path}
          </Text>
          <Text className={styles.diffDrawerMeta} numberOfLines={1}>
            {branchDiffPreview.kind === 'ready'
              ? `${branchDiffPreview.summary.baseRef}..HEAD`
              : 'Committed on branch'}
          </Text>
        </View>
        <Pressable
          className={cn(styles.diffCloseButton, 'active:bg-secondary')}
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
        <View className={styles.diffLines}>
          {branchDiffPreview.truncated ? (
            <Text className={styles.diffTruncatedText}>Diff truncated for mobile preview.</Text>
          ) : null}
          {branchDiffPreview.lines.map((line, index) => (
            <View
              key={`${index}:${line.kind}:${line.oldLineNumber ?? ''}:${line.newLineNumber ?? ''}`}
              className={cn(
                styles.diffLine,
                line.kind === 'add' && styles.diffLineAdd,
                line.kind === 'delete' && styles.diffLineDelete
              )}
            >
              <Text className={styles.diffLineNumber}>{mobileDiffLineNumber(line)}</Text>
              <Text className={styles.diffLinePrefix}>{mobileDiffLinePrefix(line.kind)}</Text>
              <Text className={styles.diffLineText}>
                {line.text ? <MobileSyntaxSegments segments={line.segments} /> : ' '}
              </Text>
            </View>
          ))}
        </View>
      )}
    </BottomDrawer>
  )
}
