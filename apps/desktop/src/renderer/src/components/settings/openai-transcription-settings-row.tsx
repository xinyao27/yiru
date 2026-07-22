import { CheckCircle as CheckCircle2, Cloud, LinkBreak as Unlink } from '@phosphor-icons/react'

import { translate } from '@/i18n/i18n'

import { Button } from '../ui/button'
import { Label } from '../ui/label'

type OpenAiTranscriptionSettingsRowProps = {
  configured: boolean
  disabled: boolean
  onConfigure: () => void
  onClear: () => void
}

export function OpenAiTranscriptionSettingsRow({
  configured,
  disabled,
  onConfigure,
  onClear
}: OpenAiTranscriptionSettingsRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <Cloud className="text-muted-foreground size-4 shrink-0" />
          <Label>
            {translate(
              'auto.components.settings.OpenAiTranscriptionSettingsRow.27e0cb656d',
              'OpenAI Transcription'
            )}
          </Label>
          {configured && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <CheckCircle2 className="size-3.5" />
              {translate(
                'auto.components.settings.OpenAiTranscriptionSettingsRow.3b0ab3fc0b',
                'Connected'
              )}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {configured
            ? translate(
                'auto.components.settings.OpenAiTranscriptionSettingsRow.b59b9b2b51',
                'API key configured for cloud speech-to-text models.'
              )
            : translate(
                'auto.components.settings.OpenAiTranscriptionSettingsRow.893790e13b',
                'Add an OpenAI API key before selecting cloud speech-to-text models.'
              )}
        </p>
      </div>
      {configured ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={disabled} onClick={onConfigure}>
            {translate(
              'auto.components.settings.OpenAiTranscriptionSettingsRow.a622bc3b37',
              'Replace key'
            )}
          </Button>
          <button
            onClick={onClear}
            aria-label={translate(
              'auto.components.settings.OpenAiTranscriptionSettingsRow.ae2df8f511',
              'Disconnect OpenAI API key'
            )}
            disabled={disabled}
            className="text-muted-foreground/50 hover:text-destructive focus-visible:text-destructive focus-visible:bg-accent rounded-md p-1 transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Unlink className="size-3.5" />
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" disabled={disabled} onClick={onConfigure}>
          {translate(
            'auto.components.settings.OpenAiTranscriptionSettingsRow.85c589cd61',
            'Add API key'
          )}
        </Button>
      )}
    </div>
  )
}
