import { useId, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { parseAgentDefaultEnvDraft, stringifyAgentDefaultEnvDraft } from './agent/default-env-draft'
import type {
  AgentCommandOverrideInputProps,
  AgentDefaultArgsInputProps,
  AgentDefaultEnvInputProps
} from './agents-pane-types'

export function AgentCommandOverrideInput({
  defaultCmd,
  cmdOverride,
  onSaveOverride
}: AgentCommandOverrideInputProps): React.JSX.Element {
  const draftSeed = cmdOverride ?? defaultCmd
  const [cmdDraft, setCmdDraft] = useState(draftSeed)

  const commitCmd = (): void => {
    const trimmed = cmdDraft.trim()
    if (!trimmed || trimmed === defaultCmd) {
      onSaveOverride('')
      setCmdDraft(defaultCmd)
    } else {
      onSaveOverride(trimmed)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {translate('auto.components.settings.AgentsPane.2e45ca29b6', 'Command')}
      </span>
      <div className="flex items-center gap-2">
        <Input
          value={cmdDraft}
          onChange={(e) => setCmdDraft(e.target.value)}
          onBlur={commitCmd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitCmd()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setCmdDraft(draftSeed)
              e.currentTarget.blur()
            }
          }}
          placeholder={defaultCmd}
          spellCheck={false}
          className="h-7 flex-1 font-mono text-xs"
        />
        {cmdOverride && (
          <Button
            type="button"
            variant="quiet"
            size="xs"
            onClick={() => {
              onSaveOverride('')
              setCmdDraft(defaultCmd)
            }}
            className="h-7 shrink-0 text-xs"
          >
            {translate('auto.components.settings.AgentsPane.5200dac9da', 'Reset')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function AgentDefaultArgsInput({
  defaultArgs,
  argsOverride,
  onSaveArgs
}: AgentDefaultArgsInputProps): React.JSX.Element {
  const draftSeed = argsOverride
  const [argsDraft, setArgsDraft] = useState(draftSeed)

  const commitArgs = (): void => {
    onSaveArgs(argsDraft.trim())
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {translate('auto.components.settings.AgentsPane.cfb3f35775', 'Arguments')}
      </span>
      <div className="flex items-center gap-2">
        <Input
          value={argsDraft}
          onChange={(e) => setArgsDraft(e.target.value)}
          onBlur={commitArgs}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitArgs()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setArgsDraft(draftSeed)
              e.currentTarget.blur()
            }
          }}
          placeholder={
            defaultArgs ||
            translate('auto.components.settings.AgentsPane.6f99bf5dd0', 'No default arguments')
          }
          spellCheck={false}
          className="h-7 flex-1 font-mono text-xs"
        />
        {argsOverride !== defaultArgs && (
          <Button
            type="button"
            variant="quiet"
            size="xs"
            onClick={() => {
              onSaveArgs(defaultArgs)
              setArgsDraft(defaultArgs)
            }}
            className="h-7 shrink-0 text-xs"
          >
            {translate('auto.components.settings.AgentsPane.5200dac9da', 'Reset')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function AgentDefaultEnvInput({
  defaultEnv,
  envOverride,
  onSaveEnv
}: AgentDefaultEnvInputProps): React.JSX.Element {
  const defaultEnvText = stringifyAgentDefaultEnvDraft(defaultEnv)
  const draftSeed = stringifyAgentDefaultEnvDraft(envOverride)
  const [envDraft, setEnvDraft] = useState(draftSeed)
  const [envDraftTooLarge, setEnvDraftTooLarge] = useState(false)
  const envDraftErrorId = useId()

  const commitEnv = (): void => {
    const parsedDraft = parseAgentDefaultEnvDraft(envDraft)
    setEnvDraftTooLarge(parsedDraft.tooLarge)
    if (parsedDraft.tooLarge) {
      return
    }
    onSaveEnv(parsedDraft.env)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {translate('auto.components.settings.AgentsPane.8fbe1f37c1', 'Environment')}
      </span>
      <div className="flex items-center gap-2">
        <Input
          value={envDraft}
          onChange={(e) => {
            setEnvDraft(e.target.value)
            if (envDraftTooLarge) {
              setEnvDraftTooLarge(false)
            }
          }}
          onBlur={commitEnv}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitEnv()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setEnvDraft(draftSeed)
              setEnvDraftTooLarge(false)
              e.currentTarget.blur()
            }
          }}
          placeholder={
            defaultEnvText ||
            translate('auto.components.settings.AgentsPane.2d133152fa', 'No default environment')
          }
          spellCheck={false}
          aria-invalid={envDraftTooLarge || undefined}
          aria-describedby={envDraftTooLarge ? envDraftErrorId : undefined}
          className={cn(
            'h-7 flex-1 font-mono text-xs',
            envDraftTooLarge && 'border-destructive/50 bg-destructive/5'
          )}
        />
        {draftSeed !== defaultEnvText && (
          <Button
            type="button"
            variant="quiet"
            size="xs"
            onClick={() => {
              onSaveEnv(defaultEnv)
              setEnvDraft(defaultEnvText)
              setEnvDraftTooLarge(false)
            }}
            className="h-7 shrink-0 text-xs"
          >
            {translate('auto.components.settings.AgentsPane.5200dac9da', 'Reset')}
          </Button>
        )}
      </div>
      {envDraftTooLarge && (
        <p id={envDraftErrorId} className="text-destructive mt-1 text-[11px]">
          {translate(
            'auto.components.settings.AgentsPane.3f1bdf3cb4',
            'Environment text is too large to parse safely.'
          )}
        </p>
      )}
    </div>
  )
}
