import {
  Cloud,
  Download,
  Trash as Trash2,
  Check,
  CaretDown as ChevronDown
} from '@phosphor-icons/react'
import type { RuntimeSpeechModelSummary } from '@yiru/runtime-protocol/contract'
import { useState } from 'react'
import { toast } from 'sonner'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type { VoiceSettings } from '~shared/speech-types'

import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { Label } from '../ui/label'

function describeSpeechModelDownloadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type VoiceSpeechModelSectionProps = {
  voiceSettings: VoiceSettings
  modelStates: RuntimeSpeechModelSummary[]
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
  onOpenOpenAiDialog: (modelId: string) => void
  onRefreshModelStates: () => void
}

function describeSpeechModel(modelId: string): string {
  switch (modelId) {
    case 'parakeet-tdt-0.6b-v3-int8':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.parakeetV3Description',
        'Highest accuracy for 25 European languages. Punctuation, capitalization, and word-level timestamps.'
      )
    case 'parakeet-tdt-0.6b-v2-int8':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.parakeetV2Description',
        'English only. Faster than v3 with similar accuracy. Punctuation and capitalization.'
      )
    case 'zipformer-bilingual-zh-en':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.zipformerBilingualDescription',
        'Chinese + English with code-switching. Low-latency real-time streaming.'
      )
    case 'paraformer-bilingual-zh-en':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.paraformerBilingualDescription',
        'Chinese (Mandarin + dialects) + English. Strong on accented and regional Chinese.'
      )
    case 'zipformer-streaming-en-20m':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.zipformerEnglishDescription',
        'English only. Lightweight 20M-param model, good balance of speed and size.'
      )
    case 'zipformer-streaming-zh-14m':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.zipformerChineseDescription',
        'Chinese only. Ultra-lightweight 14M-param model, ideal for low-resource devices.'
      )
    case 'zipformer-streaming-korean':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.zipformerKoreanDescription',
        'Korean only. Low-latency real-time streaming.'
      )
    case 'parakeet-tdt-ctc-0.6b-ja-int8':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.parakeetJapaneseDescription',
        'Japanese only. Trained on 35k+ hours of natural speech. Punctuation included.'
      )
    case 'whisper-tiny':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.whisperDescription',
        '90+ languages. Lower accuracy than Parakeet but broadest language coverage.'
      )
    case 'sense-voice-zh-en-ja-ko-yue':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.senseVoiceDescription',
        'Chinese, English, Japanese, Korean, and Cantonese with automatic language detection.'
      )
    case 'openai-gpt-4o-mini-transcribe':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.gpt4oMiniDescription',
        'Cloud transcription with strong accuracy and low cost. Requires an OpenAI API key.'
      )
    case 'openai-gpt-4o-transcribe':
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.gpt4oDescription',
        'Cloud transcription with higher accuracy. Requires an OpenAI API key.'
      )
    default:
      return translate(
        'auto.components.settings.VoiceSpeechModelSection.genericDescription',
        'Speech recognition model.'
      )
  }
}

export function VoiceSpeechModelSection({
  voiceSettings,
  modelStates,
  onUpdateVoiceSettings,
  onOpenOpenAiDialog,
  onRefreshModelStates
}: VoiceSpeechModelSectionProps): React.JSX.Element {
  const [pendingDeleteModelIds, setPendingDeleteModelIds] = useState<Set<string>>(() => new Set())

  const selectedModel = voiceSettings.sttModel
    ? modelStates.find((m) => m.id === voiceSettings.sttModel)
    : undefined
  const selectedIsReady = selectedModel?.status === 'ready'

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label>{translate('auto.components.settings.VoicePane.43fd4f454b', 'Speech Model')}</Label>
        <p className="text-muted-foreground text-xs">
          {selectedModel && selectedIsReady
            ? `${selectedModel.label} — ${describeSpeechModel(selectedModel.id)}`
            : translate(
                'auto.components.settings.VoicePane.e24f7d43d2',
                'Select a speech model. Local models run offline; cloud models require an API key.'
              )}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={!voiceSettings.enabled}
              className="shrink-0 gap-1.5"
            >
              {selectedModel && selectedIsReady
                ? selectedModel.label
                : translate('auto.components.settings.VoicePane.fbe5990716', 'Select Model')}
              <ChevronDown className="size-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-96">
          {modelStates.map((manifest) => {
            const isReady = manifest.status === 'ready'
            const isDownloading =
              manifest.status === 'downloading' || manifest.status === 'extracting'
            const isActive = voiceSettings.sttModel === manifest.id
            const isCloud = manifest.provider === 'openai'
            const deletePending = pendingDeleteModelIds.has(manifest.id)
            const sizeMb = manifest.sizeBytes ? Math.round(manifest.sizeBytes / 1_000_000) : null

            return (
              <DropdownMenuItem
                key={manifest.id}
                disabled={isDownloading}
                onClick={(event) => {
                  if (isReady) {
                    onUpdateVoiceSettings({ sttModel: manifest.id })
                  } else if (isCloud) {
                    onOpenOpenAiDialog(manifest.id)
                  } else if (!isDownloading) {
                    // Why: download progress appears in this menu, so starting one should not dismiss it.
                    event.preventDefault()
                    void callRuntimeOrpc(
                      { kind: 'local' },
                      (client) => client.speech.models.download,
                      { modelId: manifest.id }
                    ).catch((error: unknown) =>
                      toast.error(
                        translate(
                          'auto.components.settings.VoicePane.cfde55c7b0',
                          'Failed to download model.'
                        ),
                        // Why: the raw cause (e.g. net::ERR_CONTENT_LENGTH_MISMATCH)
                        // is the only diagnosable signal users can report back.
                        { description: describeSpeechModelDownloadError(error) }
                      )
                    )
                  }
                }}
                className={cn(
                  'group flex items-center gap-2.5 py-2.5',
                  !isCloud && !isReady && !isDownloading ? 'opacity-50' : ''
                )}
                closeOnClick={false}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isActive && isReady ? (
                    <Check className="size-3.5" />
                  ) : isDownloading ? (
                    <LoadingIndicator className="text-muted-foreground size-3.5" />
                  ) : isCloud ? (
                    <Cloud className="text-muted-foreground size-3.5" />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{manifest.label}</span>
                    {!isCloud && (
                      <span className="bg-muted text-muted-foreground px-1 py-px text-[10px] leading-none">
                        {manifest.streaming
                          ? translate('auto.components.settings.VoicePane.d504ab05f0', 'streaming')
                          : translate('auto.components.settings.VoicePane.8f4d2a51d7', 'offline')}
                      </span>
                    )}
                    {manifest.recommended && (
                      <span className="bg-green-700/10 px-1 py-px text-[10px] leading-none text-green-700 dark:bg-green-300/10 dark:text-green-300">
                        {translate('auto.components.settings.VoicePane.1ba81c0ff0', 'recommended')}
                      </span>
                    )}
                    <span className="text-muted-foreground/60 text-[10px]">
                      {isDownloading && manifest.progress !== null
                        ? manifest.status === 'extracting'
                          ? translate(
                              'auto.components.settings.VoicePane.61a16c8141',
                              'Extracting...'
                            )
                          : `${Math.round(manifest.progress * 100)}%`
                        : isCloud
                          ? null
                          : translate(
                              'auto.components.settings.VoicePane.91980ce124',
                              '{{value0}} MB',
                              { value0: sizeMb }
                            )}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
                    {describeSpeechModel(manifest.id)}
                  </p>
                </div>
                {!isCloud && isReady ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.settings.VoicePane.6fa734ed95',
                      'Delete {{value0}}',
                      {
                        value0: manifest.label
                      }
                    )}
                    disabled={deletePending}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (deletePending) {
                        return
                      }
                      setPendingDeleteModelIds((prev) => {
                        const next = new Set(prev)
                        next.add(manifest.id)
                        return next
                      })
                      void callRuntimeOrpc(
                        { kind: 'local' },
                        (client) => client.speech.models.delete,
                        { modelId: manifest.id }
                      )
                        .then(onRefreshModelStates)
                        .catch(() =>
                          toast.error(
                            translate(
                              'auto.components.settings.VoicePane.68de13f72c',
                              'Failed to delete model.'
                            )
                          )
                        )
                        .finally(() =>
                          setPendingDeleteModelIds((prev) => {
                            const next = new Set(prev)
                            next.delete(manifest.id)
                            return next
                          })
                        )
                    }}
                    className="text-muted-foreground can-hover:opacity-0 hover:text-destructive disabled:hover:text-muted-foreground shrink-0 group-hover:opacity-100 disabled:opacity-60"
                  >
                    {deletePending ? (
                      <LoadingIndicator className="size-3" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </Button>
                ) : !isCloud && !isReady && !isDownloading ? (
                  <span className="text-muted-foreground can-hover:opacity-0 shrink-0 p-1 transition-opacity group-hover:opacity-100">
                    <Download className="size-3" />
                  </span>
                ) : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
