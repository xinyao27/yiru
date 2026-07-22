import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  File,
  FileText,
  Folder,
  Image as ImageIcon
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { triggerSelection } from '../platform/haptics'
import { spacing } from '../theme/uniwind-theme-values'
import { type FileExplorerRow, isMarkdownPath, type TreeNode } from './file-tree'
import { fileExplorerStyles as styles } from './mobile-file-explorer-styles'
import { canPreviewMobileFileRow } from './mobile-file-preview-navigation'

type Props = {
  item: FileExplorerRow
  expanded: ReadonlySet<string>
  onPreviewFile: (relativePath: string, displayName: string) => void
  onRetryDirectory: (relativePath: string) => void
  onToggleDirectory: (relativePath: string) => void
}

export function MobileFileExplorerRow(props: Props) {
  const { item, expanded, onPreviewFile, onRetryDirectory, onToggleDirectory } = props

  if (item.kind === 'loading') {
    return (
      <View
        className={styles.inlineStatusRow}
        style={[{ paddingLeft: spacing.lg + item.depth * 18 }]}
      >
        <View className={styles.chevronSpacer} />
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        <Text className={styles.inlineStatusText}>Loading...</Text>
      </View>
    )
  }

  if (item.kind === 'error') {
    return (
      <View
        className={styles.inlineStatusRow}
        style={[{ paddingLeft: spacing.lg + item.depth * 18 }]}
      >
        <View className={styles.chevronSpacer} />
        <Text className={styles.inlineErrorText} numberOfLines={1}>
          {item.message || 'Unable to load folder'}
        </Text>
        <Pressable
          className={cn(styles.inlineRetryButton, styles.rowPressedActive)}
          onPress={() => {
            triggerSelection()
            onRetryDirectory(item.relativePath)
          }}
          accessibilityLabel={`Retry loading ${item.relativePath}`}
        >
          <Text className={styles.inlineRetryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  if (isTreeNode(item)) {
    return (
      <TreeRow
        item={item}
        expanded={expanded}
        onPreviewFile={onPreviewFile}
        onToggleDirectory={onToggleDirectory}
      />
    )
  }

  return null
}

function isTreeNode(item: FileExplorerRow): item is TreeNode {
  return item.kind === 'directory' || item.kind === 'text' || item.kind === 'binary'
}

function TreeRow(props: {
  item: TreeNode
  expanded: ReadonlySet<string>
  onPreviewFile: (relativePath: string, displayName: string) => void
  onToggleDirectory: (relativePath: string) => void
}) {
  const { item, expanded, onPreviewFile, onToggleDirectory } = props
  const isDirectory = item.kind === 'directory'
  const isExpanded = expanded.has(item.relativePath)
  // Images render in the mobile viewer (via files.readPreview), so a binary
  // image is openable; only non-previewable binaries are unavailable.
  const previewable =
    item.kind !== 'directory' &&
    canPreviewMobileFileRow({ kind: item.kind, relativePath: item.relativePath })
  const isImage = item.kind === 'binary' && previewable
  const disabled = item.kind === 'binary' && !previewable
  const markdown = item.kind === 'text' && isMarkdownPath(item.relativePath)

  return (
    <Pressable
      className={cn(
        styles.row,
        !disabled && styles.rowPressedActive,
        disabled && styles.rowDisabled
      )}
      style={{ paddingLeft: spacing.lg + item.depth * 18 }}
      disabled={disabled}
      onPress={() => {
        triggerSelection()
        if (isDirectory) {
          onToggleDirectory(item.relativePath)
        } else if (!disabled) {
          onPreviewFile(item.relativePath, item.name)
        }
      }}
      accessibilityLabel={
        isDirectory
          ? `Open folder ${item.name}`
          : disabled
            ? `${item.name} unavailable on mobile`
            : `Preview file ${item.name}`
      }
    >
      {isDirectory ? (
        isExpanded ? (
          <ChevronDown size={16} colorClassName="accent-muted-foreground" />
        ) : (
          <ChevronRight size={16} colorClassName="accent-muted-foreground" />
        )
      ) : (
        <View className={styles.chevronSpacer} />
      )}
      {isDirectory ? (
        <Folder size={17} colorClassName="accent-muted-foreground" />
      ) : markdown ? (
        <FileText size={17} colorClassName="accent-muted-foreground" />
      ) : isImage ? (
        <ImageIcon size={17} colorClassName="accent-muted-foreground" />
      ) : (
        <File size={17} colorClassName="accent-muted-foreground" />
      )}
      <View className={styles.rowTextBlock}>
        <Text
          className={cn(styles.rowTitle, disabled && styles.rowTitleDisabled)}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {disabled ? <Text className={styles.rowMeta}>Unavailable on mobile</Text> : null}
      </View>
    </Pressable>
  )
}
