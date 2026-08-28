import { useState } from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  CaretDown as ChevronDown,
  ArrowSquareOut as ExternalLink
} from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { AgentAvailabilityControl } from './agent-availability'
import {
  AgentCommandOverrideInput,
  AgentDefaultArgsInput,
  AgentDefaultEnvInput
} from './agent-launch-inputs'
import { stringifyAgentDefaultEnvDraft } from './agent/default-env-draft'
import type { AgentRowProps } from './agents-pane-types'
import { AgentSessionSourceHomeInput } from './codex-session-source-home-control'
import { SettingsBadge } from './form-controls'

export function AgentRow({
  agentId,
  label,
  homepageUrl,
  defaultCmd,
  defaultArgs,
  defaultEnv,
  isDetected,
  isEnabled,
  isDefault,
  cmdOverride,
  argsOverride,
  envOverride,
  onSetDefault,
  onSetEnabled,
  onSaveOverride,
  onSaveArgs,
  onSaveEnv,
  sessionSourceHome
}: AgentRowProps): React.JSX.Element {
  const envSummary = stringifyAgentDefaultEnvDraft(envOverride)
  const defaultEnvSummary = stringifyAgentDefaultEnvDraft(defaultEnv)
  const [cmdOpen, setCmdOpen] = useState(
    Boolean(cmdOverride) || argsOverride !== defaultArgs || envSummary !== defaultEnvSummary
  )

  return (
    <div className={cn('py-3', !isDetected && 'opacity-70')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="border-border/50 bg-background/50 flex size-7 shrink-0 items-center justify-center border">
          <AgentIcon agent={agentId} size={16} />
        </div>

        <div className="min-w-0 flex-1 sm:min-w-[12rem]">
          <div className="flex items-center gap-2">
            <span className="text-sm leading-none font-medium">{label}</span>
            {!isEnabled && (
              <SettingsBadge tone="muted">
                {translate('auto.components.settings.AgentsPane.8dc0192e48', 'Disabled')}
              </SettingsBadge>
            )}
          </div>
          <div className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
            {cmdOverride ? (
              <span>
                <span className="text-muted-foreground/60 line-through">{defaultCmd}</span>
                <span className="text-foreground/80 ml-1.5">{cmdOverride}</span>
              </span>
            ) : (
              defaultCmd
            )}
            {argsOverride && <span className="text-foreground/70 ml-1.5">{argsOverride}</span>}
            {envSummary && <span className="text-foreground/60 ml-1.5">{envSummary}</span>}
          </div>
        </div>

        <div className="ml-auto grid shrink-0 grid-cols-[max-content_6.5rem_1.75rem_1.75rem] items-center gap-1.5">
          <AgentAvailabilityControl
            label={label}
            isEnabled={isEnabled}
            onSetEnabled={onSetEnabled}
          />

          <div className="flex justify-start">
            {isDetected && isEnabled && (
              <Button
                type="button"
                variant={isDefault ? 'secondary' : 'ghost'}
                size="xs"
                onClick={onSetDefault}
                title={
                  isDefault
                    ? translate('auto.components.settings.AgentsPane.d7625cf8b2', 'Default agent')
                    : translate('auto.components.settings.AgentsPane.5f986a9b92', 'Set as default')
                }
                className="h-7 w-full justify-center gap-1 text-xs"
              >
                {isDefault && <Check className="size-3" />}
                {isDefault
                  ? translate('auto.components.settings.AgentsPane.24e032fa34', 'Default')
                  : translate('auto.components.settings.AgentsPane.959b67385b', 'Set default')}
              </Button>
            )}
          </div>

          <a
            href={homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault()
              openHttpLink(homepageUrl, { event })
            }}
            title={
              isDetected
                ? translate('auto.components.settings.AgentsPane.fe4d630c94', 'Docs')
                : translate('auto.components.settings.AgentsPane.f95b5c79b8', 'Install')
            }
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground flex size-7 items-center justify-center transition-colors outline-none"
          >
            <ExternalLink className="size-3.5" />
          </a>

          <div className="flex size-7 items-center justify-center">
            {isDetected && (
              <Button
                type="button"
                variant="quiet"
                size="icon-sm"
                onClick={() => setCmdOpen((prev) => !prev)}
                aria-label={
                  cmdOpen
                    ? translate(
                        'auto.components.settings.AgentsPane.cea7d97be1',
                        'Collapse command override'
                      )
                    : translate(
                        'auto.components.settings.AgentsPane.dc4a2ffdc0',
                        'Expand command override'
                      )
                }
                className="size-7"
              >
                <ChevronDown
                  className={cn('size-3.5 transition-transform', cmdOpen && 'rotate-180')}
                />
              </Button>
            )}
          </div>
        </div>
      </div>

      {isDetected && cmdOpen && (
        <div className="mt-3 pl-10">
          {/* Why: key by the persisted seed so settings changes reset the draft during reconciliation, not in a follow-up effect commit. */}
          <AgentCommandOverrideInput
            key={cmdOverride ?? defaultCmd}
            defaultCmd={defaultCmd}
            cmdOverride={cmdOverride}
            onSaveOverride={onSaveOverride}
          />
          <div className="mt-2">
            <AgentDefaultArgsInput
              key={`${agentId}:${argsOverride}`}
              defaultArgs={defaultArgs}
              argsOverride={argsOverride}
              onSaveArgs={onSaveArgs}
            />
          </div>
          {(defaultEnvSummary || envSummary) && (
            <div className="mt-2">
              <AgentDefaultEnvInput
                key={`${agentId}:${envSummary}`}
                defaultEnv={defaultEnv}
                envOverride={envOverride}
                onSaveEnv={onSaveEnv}
              />
            </div>
          )}
          {sessionSourceHome && (
            <div className="mt-2">
              <AgentSessionSourceHomeInput
                key={`${agentId}:${sessionSourceHome.runtimeLabel}:${sessionSourceHome.value}`}
                runtimeLabel={sessionSourceHome.runtimeLabel}
                value={sessionSourceHome.value}
                onSave={sessionSourceHome.onSave}
              />
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-[11px]">
            {translate(
              'auto.components.settings.AgentsPane.f9f127d664',
              'Override the binary path or name, and edit the default launch arguments or environment for this agent.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
