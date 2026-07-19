import {
  Cloud,
  Download,
  Trash as Trash2,
  CaretDown as ChevronDown,
  Check
} from '@phosphor-icons/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { LoadingIndicator } from '@/components/loading-indicator'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { VoiceSettings } from '../../../../shared/speech-types'
import type { SpeechModelManifest, SpeechModelState } from '../../../../shared/speech-types'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { Label } from '../ui/label'

function describeSpeechModelDownloadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Why: ipcRenderer.invoke wraps main-process rejections; strip the transport
  // prefix so the toast shows only the underlying download failure.
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

type VoiceSpeechModelSectionProps = {
  voiceSettings: VoiceSettings
  catalog: SpeechModelManifest[]
  modelStates: SpeechModelState[]
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
  onOpenOpenAiDialog: (modelId: string) => void
  onRefreshModelStates: () => void
}

export function VoiceSpeechModelSection({
  voiceSettings,
  catalog,
  modelStates,
  onUpdateVoiceSettings,
  onOpenOpenAiDialog,
  onRefreshModelStates
}: VoiceSpeechModelSectionProps): React.JSX.Element {
  const [pendingDeleteModelIds, setPendingDeleteModelIds] = useState<Set<string>>(() => new Set())
  const getModelState = (id: string): SpeechModelState | undefined =>
    modelStates.find((s) => s.id === id)

  const selectedModel = catalog.find((m) => m.id === voiceSettings.sttModel)
  const selectedModelState = voiceSettings.sttModel
    ? getModelState(voiceSettings.sttModel)
    : undefined
  const selectedIsReady = selectedModelState?.status === 'ready'

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label>{translate('auto.components.settings.VoicePane.43fd4f454b', 'Speech Model')}</Label>
        <p className="text-muted-foreground text-xs">
          {selectedModel && selectedIsReady
            ? `${selectedModel.label} — ${selectedModel.description}`
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
          {catalog.map((manifest) => {
            const mState = getModelState(manifest.id)
            const isReady = mState?.status === 'ready'
            const isDownloading =
              mState?.status === 'downloading' || mState?.status === 'extracting'
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
                    void window.api.speech.downloadModel(manifest.id).catch((error: unknown) =>
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
                      <span className="bg-muted text-muted-foreground rounded-full px-1 py-px text-[10px] leading-none">
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
                      {isDownloading && mState?.progress !== undefined
                        ? mState.status === 'extracting'
                          ? translate(
                              'auto.components.settings.VoicePane.61a16c8141',
                              'Extracting...'
                            )
                          : `${Math.round(mState.progress * 100)}%`
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
                    {manifest.description}
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
                      void window.api.speech
                        .deleteModel(manifest.id)
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
