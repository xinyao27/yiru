import { ChatCentered as MessageSquarePlus } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import AgentCombobox from '@/components/agent/agent-combobox'
import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { getAgentCatalog, getAgentLabel } from '@/lib/agent-catalog'
import {
  buildAgentSessionContinuationPrompt,
  hasFullAgentSessionContext,
  type AgentSessionContinuationContextMode,
  type AgentSessionContinuationRequest
} from '@/lib/agent-session-continuation'
import {
  detectAgentSessionContinuationAgents,
  launchAgentSessionContinuation
} from '@/lib/launch-agent-session-continuation'
import { useAppStore } from '@/store'

import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/types'
import { chooseInitialContinuationAgent } from './agent-session-continuation-selection'

type AgentSessionContinuationDialogProps = {
  open: boolean
  request: AgentSessionContinuationRequest | null
  onOpenChange: (open: boolean) => void
}

const EMPTY_DISABLED_AGENTS: TuiAgent[] = []

export function AgentSessionContinuationDialog({
  open,
  request,
  onOpenChange
}: AgentSessionContinuationDialogProps): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const [detectedAgents, setDetectedAgents] = useState<TuiAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<TuiAgent | null>(null)
  const [contextMode, setContextMode] = useState<AgentSessionContinuationContextMode>('focused')
  const [detecting, setDetecting] = useState(true)
  const [detectionFailed, setDetectionFailed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [showStarting, setShowStarting] = useState(false)
  const disabledAgents = settings?.disabledTuiAgents ?? EMPTY_DISABLED_AGENTS

  const agents = useMemo(
    () =>
      getAgentCatalog().filter(
        (agent) => detectedAgents.includes(agent.id) && isTuiAgentEnabled(agent.id, disabledAgents)
      ),
    [detectedAgents, disabledAgents]
  )
  const hasFullContext = request ? hasFullAgentSessionContext(request.source) : false

  useEffect(() => {
    if (!open || !request) {
      return
    }
    let cancelled = false
    setDetecting(true)
    setDetectionFailed(false)
    setDetectedAgents([])
    setSelectedAgent(null)
    setContextMode('focused')
    void detectAgentSessionContinuationAgents(request.worktreeId)
      .then((detected) => {
        if (cancelled) {
          return
        }
        const enabled = detected.filter((agent) => isTuiAgentEnabled(agent, disabledAgents))
        setDetectedAgents(enabled)
        setSelectedAgent(
          chooseInitialContinuationAgent({
            availableAgents: enabled,
            sourceAgent: request.source.sourceAgent,
            defaultAgent: settings?.defaultTuiAgent
          })
        )
      })
      .catch((error) => {
        console.error('Agent detection failed for continuation dialog', error)
        if (!cancelled) {
          setDetectedAgents([])
          setSelectedAgent(null)
          setDetectionFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetecting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [disabledAgents, open, request, settings?.defaultTuiAgent])

  useEffect(() => {
    if (!starting) {
      setShowStarting(false)
      return
    }
    // Why: local launches are often instant; defer progress chrome so fast paths do not flicker.
    const timer = window.setTimeout(() => setShowStarting(true), 200)
    return () => window.clearTimeout(timer)
  }, [starting])

  const handleStart = async (): Promise<void> => {
    if (!request || !selectedAgent || starting) {
      return
    }
    const prompt = buildAgentSessionContinuationPrompt(request.source, contextMode)
    if (!prompt) {
      return
    }
    setStarting(true)
    const launched = await launchAgentSessionContinuation({
      agent: selectedAgent,
      prompt,
      worktreeId: request.worktreeId,
      groupId: request.groupId,
      workspacePath: request.workspacePath,
      initialCwd: request.initialCwd,
      launchSource: request.launchSource
    })
    setStarting(false)
    if (launched) {
      onOpenChange(false)
    }
  }

  const sourceName = request?.source.sourceTitle?.trim()
  const sourceAgentLabel = request?.source.sourceAgent
    ? getAgentLabel(request.source.sourceAgent)
    : null
  const startDisabled = detecting || starting || agents.length === 0 || !selectedAgent

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!starting) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent className="min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <MessageSquarePlus className="size-4" />
            {translate(
              'components.agentSessionContinuation.dialogTitle',
              'Continue in New Session'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'components.agentSessionContinuation.dialogDescription',
              'Start a fresh Agent session from this stopping point. The original session stays unchanged.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="bg-card min-w-0 border px-3 py-2">
            <div className="truncate text-xs font-medium">
              {sourceName ||
                translate('components.agentSessionContinuation.untitledSession', 'Current session')}
            </div>
            {sourceAgentLabel ? (
              <div className="text-muted-foreground mt-0.5 text-[11px]">
                {translate(
                  'components.agentSessionContinuation.originalAgent',
                  'Original Agent: {{agent}}',
                  { agent: sourceAgentLabel }
                )}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-2">
            <Label>{translate('components.agentSessionContinuation.agent', 'Agent')}</Label>
            <AgentCombobox
              agents={agents}
              value={selectedAgent}
              onValueChange={setSelectedAgent}
              allowBlankTerminal={false}
              allowNarrowTrigger
              emptyLabel={translate(
                'components.agentSessionContinuation.selectAgent',
                'Select an Agent'
              )}
              triggerClassName="min-w-0 w-full"
            />
            {detecting ? (
              <p className="text-muted-foreground text-[11px]">
                {translate(
                  'components.agentSessionContinuation.detectingAgents',
                  'Detecting Agents on this workspace host…'
                )}
              </p>
            ) : detectionFailed ? (
              <p className="text-destructive text-[11px]">
                {translate(
                  'components.agentSessionContinuation.detectionFailed',
                  'Could not detect Agents on this workspace host.'
                )}
              </p>
            ) : agents.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">
                {translate(
                  'components.agentSessionContinuation.noAgents',
                  'No enabled Agents were detected on this workspace host.'
                )}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 space-y-2">
            <Label>{translate('components.agentSessionContinuation.context', 'Context')}</Label>
            <Select
              value={contextMode}
              onValueChange={(value) =>
                setContextMode(value as AgentSessionContinuationContextMode)
              }
            >
              <SelectTrigger className="w-full min-w-0" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="focused">
                  {translate(
                    'components.agentSessionContinuation.modeFocused',
                    'Focused handoff (Recommended)'
                  )}
                </SelectItem>
                <SelectItem value="full" disabled={!hasFullContext}>
                  {translate(
                    'components.agentSessionContinuation.modeFull',
                    'Full session transcript'
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-[11px] leading-4">
              {contextMode === 'focused'
                ? translate(
                    'components.agentSessionContinuation.modeFocusedDescription',
                    'Uses the latest status and current workspace, reading older transcript details only when needed.'
                  )
                : translate(
                    'components.agentSessionContinuation.modeFullDescription',
                    'Asks the new Agent to read the complete saved session before continuing. This can take longer and use significant context, plan usage, or API credits.'
                  )}
            </p>
          </div>

          {request?.initialCwd ? (
            <div className="text-muted-foreground text-[11px]">
              {translate('components.agentSessionContinuation.startsIn', 'Starts in:')}{' '}
              <span className="text-foreground/80 font-mono break-all">{request.initialCwd}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={starting}
            onClick={() => onOpenChange(false)}
          >
            {translate('components.native-chat.question.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            autoFocus
            disabled={startDisabled}
            onClick={() => void handleStart()}
          >
            {showStarting ? <LoadingIndicator className="size-3.5" /> : null}
            {starting
              ? translate('components.agentSessionContinuation.starting', 'Starting…')
              : translate('components.agentSessionContinuation.startSession', 'Start New Session')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
