import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { Check, Download, Trash as Trash2 } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  isModelInFlight,
  type MobileSpeechModel,
  type MobileSpeechSetup
} from '../dictation/mobile-dictation-setup'

type Props = {
  setup: MobileSpeechSetup
  // Disabled mirrors desktop: the model list greys out when dictation is off.
  disabled: boolean
  busyAction: { modelId: string; type: 'download' | 'select' | 'delete' } | null
  onUseModel: (model: MobileSpeechModel) => void
  onDownload: (model: MobileSpeechModel) => void
  onDelete: (model: MobileSpeechModel) => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) {
    return ''
  }
  return `${Math.round(bytes / 1_000_000)} MB`
}

function modelMeta(model: MobileSpeechModel): string {
  if (model.provider === 'openai') {
    return 'OpenAI API'
  }
  const inFlight = isModelInFlight(model)
  if (inFlight && model.progress != null) {
    return `${formatSize(model.sizeBytes)} · ${Math.round(model.progress * 100)}%`
  }
  if (model.status === 'extracting') {
    return `${formatSize(model.sizeBytes)} · extracting…`
  }
  return formatSize(model.sizeBytes)
}

// Renders the speech-model rows shared between the setup sheet and the Voice
// settings page: size/progress, recommended badge, selected check, download, delete.
export function VoiceModelList({
  setup,
  disabled,
  busyAction,
  onUseModel,
  onDownload,
  onDelete
}: Props): React.JSX.Element {
  return (
    <View
      className={cn(disabled ? styles.disabled : undefined)}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {setup.models.map((model, idx) => {
        const anyBusy = busyAction !== null
        const isSelected = model.id === setup.selectedModelId
        const inFlight = isModelInFlight(model)
        const rowBusy = busyAction?.modelId === model.id
        const selectBusy = rowBusy && busyAction?.type === 'select'
        const downloadBusy = rowBusy && busyAction?.type === 'download'
        const deleteBusy = rowBusy && busyAction?.type === 'delete'
        return (
          <View key={model.id}>
            {idx > 0 && <View className={styles.separator} />}
            <View className={styles.modelRow}>
              <View className={styles.modelInfo}>
                <View className={styles.modelTitleRow}>
                  <Text className={styles.modelLabel} numberOfLines={1}>
                    {model.label}
                  </Text>
                  {model.recommended ? (
                    <Text className={styles.recommended}>Recommended</Text>
                  ) : null}
                </View>
                <Text className={styles.modelMeta}>{modelMeta(model)}</Text>
              </View>
              {model.provider === 'openai' ? (
                <Text className={styles.modelStateText}>
                  {model.status === 'ready' ? 'API key set' : 'Set up on desktop'}
                </Text>
              ) : model.status === 'ready' ? (
                <View className={styles.readyActions}>
                  {isSelected ? (
                    <View className={styles.selectedTag}>
                      <Check size={14} colorClassName="accent-green-500" />
                      <Text className={styles.selectedText}>In use</Text>
                    </View>
                  ) : (
                    <Pressable
                      className={cn(styles.actionButton, styles.actionPressedActive)}
                      disabled={anyBusy}
                      onPress={() => onUseModel(model)}
                    >
                      {selectBusy ? (
                        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                      ) : (
                        <Text className={styles.actionText}>Use</Text>
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    className={cn(styles.iconButton, styles.actionPressedActive)}
                    disabled={anyBusy}
                    onPress={() => onDelete(model)}
                    accessibilityLabel={`Delete ${model.label}`}
                  >
                    {deleteBusy ? (
                      <ActivityIndicator size="small" colorClassName="accent-destructive" />
                    ) : (
                      <Trash2 size={18} colorClassName="accent-destructive" />
                    )}
                  </Pressable>
                </View>
              ) : inFlight ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : (
                <Pressable
                  className={cn(styles.iconButton, styles.actionPressedActive)}
                  disabled={anyBusy}
                  onPress={() => onDownload(model)}
                  accessibilityLabel={`Download ${model.label}`}
                >
                  {downloadBusy ? (
                    <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
                  ) : (
                    <Download size={18} colorClassName="accent-muted-foreground" />
                  )}
                </Pressable>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = {
  disabled: cn('opacity-[0.5]'),
  modelRow: cn('flex-row items-center justify-between gap-3 py-3 px-3.5'),
  modelInfo: cn('flex-1 min-w-0'),
  modelTitleRow: cn('flex-row items-center gap-2'),
  modelLabel: cn('text-foreground text-[14px] font-medium shrink'),
  recommended: cn('text-green-500 text-[10px] font-bold'),
  modelMeta: cn('text-muted-foreground/60 text-[12px] mt-[2px]'),
  modelStateText: cn('text-muted-foreground/60 text-[12px]'),
  actionButton: cn('flex-row items-center gap-[5px] px-3 py-1.5 rounded-none bg-secondary'),
  actionPressedActive: cn('active:opacity-[0.7]'),
  actionText: cn('text-muted-foreground text-[12px] font-semibold'),
  iconButton: cn('w-[34px] h-[34px] rounded-none items-center justify-center bg-secondary'),
  readyActions: cn('flex-row items-center gap-1'),
  selectedTag: cn('flex-row items-center gap-1'),
  selectedText: cn('text-green-500 text-[12px] font-semibold'),
  separator: cn('h-hairline bg-border mx-3')
} as const
