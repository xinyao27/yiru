import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAppStore } from '@/store'

import { renderSourceControlActionCommandTemplate } from '../../../../../shared/source-control/ai-actions'
import { isTuiAgentEnabled } from '../../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../../shared/types'
import { getAgentCatalog } from '../../../lib/agent-catalog'
import {
  pickSourceControlLaunchAgent,
  resolveSourceControlLaunchAgentScope
} from '../../../lib/source-control-launch-agent-selection'
import { useRepoById } from '../../../store/selectors'
import { useSavedSourceControlAgentActionAutoStart } from '../use-saved-source-control-agent-action-auto-start'
import type { SourceControlAgentActionDialogProps } from './agent-action-dialog'
import type { UseSourceControlAgentActionDialogResult } from './agent-action-dialog-result'
import {
  buildSourceControlAgentOpenSessionKey,
  buildSourceControlAgentSaveTargets,
  buildSourceControlAgentScopeNote,
  buildSourceControlAgentStatusCopy,
  isSourceControlAgentDetectedAndEnabled
} from './agent-action-dialog-support'
import { useSourceControlAgentActionStart } from './use-agent-action-start'

const DEFAULT_SAVE_TARGET_VALUE = 'global'

export function useSourceControlAgentActionDialog({
  open,
  onOpenChange,
  actionId,
  baseCommandInput,
  savedCommandInputTemplate,
  savedAgentArgs,
  worktreeId,
  groupId,
  connectionId,
  repoId,
  promptDelivery = 'submit-after-ready',
  launchPlatform,
  launchSource,
  savedAgentId,
  onSaveAgentDefault,
  onLaunched,
  onStart
}: SourceControlAgentActionDialogProps): UseSourceControlAgentActionDialogResult {
  const settings = useAppStore((state) => state.settings)
  const repo = useRepoById(repoId ?? null)
  const launchAgentScope = useMemo(
    () => resolveSourceControlLaunchAgentScope({ settings, repo, actionId }),
    [actionId, repo, settings]
  )
  // Why: when this repo already overrides the global default, default the save
  // scope to the repo so saving the corrected agent updates that override in
  // place instead of writing a global default the override would still shadow.
  const defaultSaveTargetValue =
    launchAgentScope.overridesGlobalAgent && repoId ? 'repo' : DEFAULT_SAVE_TARGET_VALUE
  const ensureDetectedAgents = useAppStore((state) => state.ensureDetectedAgents)
  const ensureRemoteDetectedAgents = useAppStore((state) => state.ensureRemoteDetectedAgents)
  const [commandTemplate, setCommandTemplate] = useState(
    savedCommandInputTemplate ?? '{basePrompt}'
  )
  const [agentArgs, setAgentArgs] = useState(savedAgentArgs ?? '')
  const [selectedAgent, setSelectedAgent] = useState<TuiAgent | null>(savedAgentId ?? null)
  const [detectedAgents, setDetectedAgents] = useState<TuiAgent[]>([])
  const [detecting, setDetecting] = useState(false)
  const [openCycle, setOpenCycle] = useState(0)
  const [openSessionKey, setOpenSessionKey] = useState<string | null>(null)
  const [detectedOpenCycle, setDetectedOpenCycle] = useState<number | null>(null)
  const saveTargets = useMemo(() => buildSourceControlAgentSaveTargets(repoId), [repoId])
  const [saveLaunchRecipe, setSaveLaunchRecipe] = useState(true)
  const [saveTargetValue, setSaveTargetValue] = useState(defaultSaveTargetValue)

  const disabledAgents = settings?.disabledTuiAgents
  const connectionUnavailable = Boolean(worktreeId && connectionId === undefined)

  // Why: adjust state during render (React's documented pattern) instead of an
  // effect. The dialog reopening, or its target changing while it stays open,
  // both start a fresh session: bump the cycle tag and resync the editable
  // fields from the saved values in the same render that swaps the session
  // key, so no effect needs a synchronous reset to a value that isn't itself
  // prop-derived.
  const openSessionTargetKey = buildSourceControlAgentOpenSessionKey({
    open,
    repoId,
    connectionId,
    worktreeId,
    savedAgentId,
    savedCommandInputTemplate,
    savedAgentArgs,
    defaultSaveTargetValue,
    defaultTuiAgent: settings?.defaultTuiAgent,
    disabledAgents
  })
  if (openSessionTargetKey !== openSessionKey) {
    setOpenSessionKey(openSessionTargetKey)
    if (openSessionTargetKey !== null) {
      setOpenCycle((cycle) => cycle + 1)
      setCommandTemplate(savedCommandInputTemplate ?? '{basePrompt}')
      setAgentArgs(savedAgentArgs ?? '')
      setSelectedAgent(savedAgentId ?? null)
      setSaveLaunchRecipe(true)
      setSaveTargetValue(defaultSaveTargetValue)
    }
  }

  const refreshDetectedAgents = useCallback(async (): Promise<TuiAgent[]> => {
    if (connectionUnavailable) {
      setDetectedAgents([])
      setDetecting(false)
      return []
    }
    setDetecting(true)
    try {
      const nextAgents =
        typeof connectionId === 'string'
          ? await ensureRemoteDetectedAgents(connectionId)
          : await ensureDetectedAgents()
      setDetectedAgents(nextAgents)
      return nextAgents
    } finally {
      setDetecting(false)
    }
  }, [connectionId, connectionUnavailable, ensureDetectedAgents, ensureRemoteDetectedAgents])

  // Why: the reopen/target resets above happen synchronously during render;
  // this effect owns only the I/O (agent detection) that fresh session needs.
  // The staleness guard alone is enough to drop a superseded round — React
  // always runs this effect's cleanup before the next one starts.
  useEffect(() => {
    if (!open) {
      return
    }
    let stale = false
    void refreshDetectedAgents().then((nextAgents) => {
      if (stale) {
        return
      }
      setSelectedAgent(
        (current) =>
          current ??
          pickSourceControlLaunchAgent({
            savedAgent: savedAgentId,
            defaultAgent: settings?.defaultTuiAgent,
            detectedAgents: nextAgents,
            disabledAgents
          })
      )
      setDetectedOpenCycle(openCycle)
    })
    return () => {
      stale = true
    }
  }, [
    disabledAgents,
    open,
    openCycle,
    refreshDetectedAgents,
    savedAgentId,
    settings?.defaultTuiAgent
  ])

  const closeDialog = useCallback(() => onOpenChange(false), [onOpenChange])

  const enabledDetectedAgents = useMemo(
    () => detectedAgents.filter((agent) => isTuiAgentEnabled(agent, disabledAgents)),
    [detectedAgents, disabledAgents]
  )
  const agentOptions = useMemo(
    () =>
      getAgentCatalog().filter(
        (entry) => enabledDetectedAgents.includes(entry.id) || entry.id === selectedAgent
      ),
    [enabledDetectedAgents, selectedAgent]
  )
  const selectedAgentUnavailable = Boolean(
    selectedAgent &&
    !isSourceControlAgentDetectedAndEnabled(selectedAgent, detectedAgents, disabledAgents)
  )
  const hasEnabledAgents = enabledDetectedAgents.length > 0
  const commandInput = renderSourceControlActionCommandTemplate(commandTemplate, {
    basePrompt: baseCommandInput
  })
  const trimmedCommandInput = commandInput.trim()

  const { deliveryPlan, resetDeliveryPlan, isStarting, handleStart, startWithDetectedAgents } =
    useSourceControlAgentActionStart({
      selectedAgent,
      commandInput,
      trimmedCommandInput,
      agentArgs,
      commandTemplate,
      saveLaunchRecipe,
      saveTargetValue,
      actionId,
      repoId,
      settings,
      repo,
      worktreeId,
      groupId,
      promptDelivery,
      launchPlatform,
      // Why: an SSH host runs the plain `yiru` shim; keep the previewed command
      // label aligned with the real remote launch (no `yiru` rename).
      isRemote: typeof connectionId === 'string',
      launchSource,
      connectionUnavailable,
      refreshDetectedAgents,
      onStart,
      onSaveAgentDefault,
      onLaunched,
      onClose: closeDialog
    })

  const canStart =
    Boolean(trimmedCommandInput) &&
    Boolean(selectedAgent) &&
    !selectedAgentUnavailable &&
    !connectionUnavailable &&
    !detecting &&
    !isStarting

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetDeliveryPlan()
        setSaveLaunchRecipe(true)
        setSaveTargetValue(defaultSaveTargetValue)
      }
      onOpenChange(nextOpen)
    },
    [defaultSaveTargetValue, onOpenChange, resetDeliveryPlan]
  )

  const { autoLaunchPending } = useSavedSourceControlAgentActionAutoStart({
    open,
    openCycle,
    detectionReady: detectedOpenCycle === openCycle,
    actionId,
    baseCommandInput,
    savedAgentId,
    savedCommandInputTemplate,
    savedAgentArgs,
    settings,
    repo,
    repoId,
    worktreeId,
    connectionId,
    selectedAgent,
    trimmedCommandInput,
    connectionUnavailable,
    detecting,
    isStarting,
    detectedAgents,
    disabledAgents,
    onAutoStart: ({ detectedAgents: agentsForLaunch, saveTargetValue: matchedTargetValue }) =>
      startWithDetectedAgents({
        detectedAgents: agentsForLaunch,
        saveTargetValueOverride: matchedTargetValue
      })
  })

  const statusCopy = buildSourceControlAgentStatusCopy({
    selectedAgent,
    selectedAgentUnavailable,
    connectionUnavailable,
    hasEnabledAgents,
    detecting
  })

  const onSelectedAgentChange = useCallback(
    (agent: TuiAgent | null) => {
      setSelectedAgent(agent)
      resetDeliveryPlan()
    },
    [resetDeliveryPlan]
  )
  const onAgentArgsChange = useCallback(
    (value: string) => {
      setAgentArgs(value)
      resetDeliveryPlan()
    },
    [resetDeliveryPlan]
  )
  const onCommandTemplateChange = useCallback(
    (value: string) => {
      setCommandTemplate(value)
      resetDeliveryPlan()
    },
    [resetDeliveryPlan]
  )
  const onSaveLaunchRecipeChange = useCallback(
    (value: boolean) => {
      setSaveLaunchRecipe(value)
      resetDeliveryPlan()
    },
    [resetDeliveryPlan]
  )

  const agentScopeNote = useMemo(
    () => buildSourceControlAgentScopeNote(launchAgentScope),
    [launchAgentScope]
  )

  return {
    handleOpenChange,
    shouldRenderDialog: !autoLaunchPending,
    agentScopeNote,
    agentOptions,
    selectedAgent,
    hasEnabledAgents,
    detecting,
    statusCopy,
    agentArgs,
    commandTemplate,
    saveLaunchRecipe,
    saveTargetValue,
    saveTargets,
    settings,
    repo,
    deliveryPlan,
    canStart,
    isStarting,
    onSelectedAgentChange,
    onAgentArgsChange,
    onCommandTemplateChange,
    onSaveLaunchRecipeChange,
    onSaveAgentDefaultChange: setSaveTargetValue,
    handleStart
  }
}
