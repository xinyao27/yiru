import { cn } from 'cnfast'
import { ActivityIndicator, Text, View } from 'react-native'

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
    <BottomDrawer visible={branchDiffPreview !== null} onClose={onClose} title={entry.path}>
      <Text
        className="border-b-hairline border-b-border text-muted-foreground pb-3 text-xs"
        numberOfLines={1}
      >
        {branchDiffPreview.kind === 'ready'
          ? `${branchDiffPreview.summary.baseRef}..HEAD`
          : 'Committed on branch'}
      </Text>
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
        <View className="pt-3">
          {branchDiffPreview.truncated ? (
            <Text className="text-muted-foreground mb-2 text-xs">
              Diff truncated for mobile preview.
            </Text>
          ) : null}
          {branchDiffPreview.lines.map((line, index) => (
            <View
              key={`${index}:${line.kind}:${line.oldLineNumber ?? ''}:${line.newLineNumber ?? ''}`}
              className={cn(
                'flex-row items-start gap-1 py-1 px-1',
                line.kind === 'add' && 'bg-diff-inserted',
                line.kind === 'delete' && 'bg-diff-removed'
              )}
            >
              <Text className="text-muted-foreground w-10 text-right font-mono text-xs">
                {mobileDiffLineNumber(line)}
              </Text>
              <Text className="text-muted-foreground w-3 font-mono text-xs">
                {mobileDiffLinePrefix(line.kind)}
              </Text>
              <Text className="text-foreground flex-1 font-mono text-xs leading-5">
                {line.text ? <MobileSyntaxSegments segments={line.segments} /> : ' '}
              </Text>
            </View>
          ))}
        </View>
      )}
    </BottomDrawer>
  )
}
