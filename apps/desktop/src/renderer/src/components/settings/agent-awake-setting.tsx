import { cn } from '@/lib/class-names'

import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import {
  getAgentAwakeDescription,
  getAgentAwakeSearchKeywords,
  getAgentAwakeTitle
} from './agent-awake-copy'
import { SearchableSetting } from './searchable-setting'

type AgentAwakeSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentAwakeSetting({
  settings,
  updateSettings
}: AgentAwakeSettingProps): React.JSX.Element {
  const title = getAgentAwakeTitle()
  const description = getAgentAwakeDescription()

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={title}
        description={description}
        keywords={getAgentAwakeSearchKeywords()}
      >
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{title}</Label>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
          {/* Why: this button is read directly from the React element tree by tests
              that walk props (without rendering), so the role/aria attributes
              must remain on a literal <button>, not behind a component wrapper. */}
          <button
            type="button"
            role="switch"
            aria-label={title}
            aria-checked={settings.keepComputerAwakeWhileAgentsRun}
            onClick={() =>
              updateSettings({
                keepComputerAwakeWhileAgentsRun: !settings.keepComputerAwakeWhileAgentsRun
              })
            }
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
              settings.keepComputerAwakeWhileAgentsRun ? 'bg-foreground' : 'bg-muted-foreground/30',
              'outline-none'
            )}
          >
            <span
              className={cn(
                'pointer-events-none block size-3.5 rounded-full bg-background transition-transform',
                settings.keepComputerAwakeWhileAgentsRun ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>
      </SearchableSetting>
    </section>
  )
}
