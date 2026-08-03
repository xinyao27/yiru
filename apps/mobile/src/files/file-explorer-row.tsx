import { cn } from 'cnfast'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  File,
  FileText,
  Folder,
  Image as ImageIcon
} from '~/components/uniwind-icons'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { MobileGlassTextButton } from '../components/glass/text-button'
import { triggerSelection } from '../platform/haptics'
import { fileExplorerStyles as styles } from './file-explorer-styles'
import { canPreviewMobileFileRow } from './file-preview-navigation'
import { type FileExplorerRow, isMarkdownPath, type TreeNode } from './file-tree'

type Props = {
  item: FileExplorerRow
  expanded: ReadonlySet<string>
  onPreviewFile: (relativePath: string, displayName: string) => void
  onRetryDirectory: (relativePath: string) => void
  onToggleDirectory: (relativePath: string) => void
}

export function MobileFileExplorerRow(props: Props) {
  const { item, expanded, onPreviewFile, onRetryDirectory, onToggleDirectory } = props
  const spacing4 = resolveCssNumber(useCSSVariable('--spacing-4'))
  const paddingLeft = spacing4 * (item.depth + 1)

  if (item.kind === 'loading') {
    return (
      <View className={styles.inlineStatusRow} style={[{ paddingLeft }]}>
        <View className={styles.chevronSpacer} />
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        <Text className="text-muted-foreground text-xs">Loading...</Text>
      </View>
    )
  }

  if (item.kind === 'error') {
    return (
      <View className={styles.inlineStatusRow} style={[{ paddingLeft }]}>
        <View className={styles.chevronSpacer} />
        <Text className="text-destructive min-w-0 flex-1 text-xs" numberOfLines={1}>
          {item.message || 'Unable to load folder'}
        </Text>
        <MobileGlassTextButton
          accessibilityLabel={`Retry loading ${item.relativePath}`}
          label="Retry"
          onPress={() => {
            triggerSelection()
            onRetryDirectory(item.relativePath)
          }}
          size="small"
        />
      </View>
    )
  }

  if (isTreeNode(item)) {
    return (
      <TreeRow
        item={item}
        expanded={expanded}
        paddingLeft={paddingLeft}
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
  paddingLeft: number
  onPreviewFile: (relativePath: string, displayName: string) => void
  onToggleDirectory: (relativePath: string) => void
}) {
  const { item, expanded, paddingLeft, onPreviewFile, onToggleDirectory } = props
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
        'min-h-11 flex-row items-center gap-2 pr-3',
        !disabled && styles.rowPressedActive,
        disabled && 'opacity-60'
      )}
      style={{ paddingLeft }}
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
      <View className="min-w-0 flex-1">
        <Text
          className={cn('text-foreground text-sm', disabled && 'text-muted-foreground')}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {disabled ? (
          <Text className="text-muted-foreground mt-1 text-xs">Unavailable on mobile</Text>
        ) : null}
      </View>
    </Pressable>
  )
}
