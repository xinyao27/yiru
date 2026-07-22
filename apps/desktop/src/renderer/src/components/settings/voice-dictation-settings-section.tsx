import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { VoiceSettings } from '../../../../shared/speech-types'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'

type VoiceDictationSettingsSectionProps = {
  voiceSettings: VoiceSettings
  permissionPending: boolean
  onToggleVoiceDictation: () => void
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}

export function VoiceDictationSettingsSection({
  voiceSettings,
  permissionPending,
  onToggleVoiceDictation,
  onUpdateVoiceSettings
}: VoiceDictationSettingsSectionProps): React.JSX.Element {
  const shortcutLabel = useShortcutLabel('voice.dictation')

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.VoicePane.0121960365', 'Enable Voice Dictation')}
          </Label>
          <p className="text-muted-foreground text-xs">
            {translate('auto.components.settings.VoicePane.4465596675', 'Press')} {shortcutLabel}{' '}
            {translate(
              'auto.components.settings.VoicePane.366e1b4f36',
              'to dictate text into any focused pane.'
            )}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={voiceSettings.enabled}
          aria-label={translate(
            'auto.components.settings.VoicePane.0121960365',
            'Enable Voice Dictation'
          )}
          aria-busy={permissionPending}
          disabled={permissionPending}
          onClick={() => void onToggleVoiceDictation()}
          className={cn(
            'outline-none focus-visible:border-ring',
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
            voiceSettings.enabled ? 'bg-foreground' : 'bg-muted-foreground/30',
            permissionPending ? 'cursor-wait opacity-70' : ''
          )}
        >
          <span
            className={cn(
              'pointer-events-none block size-3.5 rounded-full bg-background transition-transform',
              voiceSettings.enabled ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.VoicePane.ba4a900d1d', 'Dictation Mode')}
          </Label>
          <p className="text-muted-foreground text-xs">
            {translate('auto.components.settings.VoicePane.ff9a680010', 'Toggle: press')}{' '}
            {shortcutLabel}{' '}
            {translate(
              'auto.components.settings.VoicePane.295d84b849',
              'once to start, again to stop. Hold: dictate while'
            )}{' '}
            {shortcutLabel} {translate('auto.components.settings.VoicePane.7cf715f891', 'is held.')}
          </p>
        </div>
        <div className="border-border/60 bg-background/50 flex shrink-0 items-center rounded-md border p-0.5">
          {(['toggle', 'hold'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onUpdateVoiceSettings({ dictationMode: mode })}
              disabled={!voiceSettings.enabled}
              className={cn(
                'outline-none focus-visible:text-foreground focus-visible:bg-accent',
                'rounded-sm px-3 py-1 text-sm transition-colors',
                voiceSettings.dictationMode === mode
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                !voiceSettings.enabled ? 'opacity-50 cursor-not-allowed' : ''
              )}
            >
              {mode === 'toggle'
                ? translate('auto.components.settings.VoicePane.118b3c2dee', 'Toggle')
                : translate('auto.components.settings.VoicePane.174da92062', 'Hold')}
            </button>
          ))}
        </div>
      </div>

      <Separator />
    </>
  )
}
