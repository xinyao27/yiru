import {
  WarningCircle as AlertCircle,
  FileCode as FileCode2,
  Plus,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'
import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LoadingIndicator } from '@/components/loading-indicator'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'

import {
  canInspectLocalMcpConfigRoot,
  inspectMcpConfigContent,
  MCP_CONFIG_CANDIDATES,
  MCP_STARTER_CONFIG
} from '../../../../shared/mcp-config'
import type { Repo, Worktree } from '../../../../shared/types'
import { extractIpcErrorMessage } from '../../lib/ipc-error'
import { joinPath } from '../../lib/path'
import { useAppStore } from '../../store'
import { isWindowsUserAgent } from '../terminal-pane/pane-helpers'
import { Button } from '../ui/button'
import { McpConfigFileRow, type LoadedMcpConfigInspection } from './mcp-config-file-row'
import { loadMcpConfigInspections } from './mcp-config-inspection'
import { McpMissingConfigList } from './mcp-missing-config-list'

type McpConfigSectionProps = {
  repo: Repo
}

const EMPTY_WORKTREES: Worktree[] = []

function countServers(configs: LoadedMcpConfigInspection[]): number {
  return configs.reduce((sum, config) => sum + config.servers.length, 0)
}

export function McpConfigSection({ repo }: McpConfigSectionProps): React.JSX.Element {
  const openFile = useAppStore((state) => state.openFile)
  const setActiveView = useAppStore((state) => state.setActiveView)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)
  const ensureWorktreeRootGroup = useAppStore((state) => state.ensureWorktreeRootGroup)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const worktreesForRepo = useAppStore((state) => state.worktreesByRepo[repo.id] ?? EMPTY_WORKTREES)
  const sshConnectionStatus = useAppStore((state) =>
    repo.connectionId ? state.sshConnectionStates.get(repo.connectionId)?.status : null
  )
  const [configs, setConfigs] = useState<LoadedMcpConfigInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [createConfirm, setCreateConfirm] = useState(false)
  const createConfirmResetTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()
  const [inspectionUnavailableMessage, setInspectionUnavailableMessage] = useState<string | null>(
    null
  )

  const connectionId = repo.connectionId ?? undefined
  const isWindows = isWindowsUserAgent()
  const targetWorktree = useMemo(() => {
    if (activeWorktreeId && getRepoIdFromWorktreeId(activeWorktreeId) === repo.id) {
      return (
        worktreesForRepo.find((worktree) => worktree.id === activeWorktreeId) ?? {
          id: activeWorktreeId,
          path: repo.path
        }
      )
    }
    return (
      worktreesForRepo.find((worktree) => worktree.isMainWorktree) ??
      worktreesForRepo.find((worktree) => worktree.path === repo.path) ??
      worktreesForRepo[0] ?? { id: `${repo.id}::${repo.path}`, path: repo.path }
    )
  }, [activeWorktreeId, repo.id, repo.path, worktreesForRepo])
  const targetWorktreeId = targetWorktree.id
  const targetRootPath = targetWorktree.path
  const detectedCount = useMemo(() => configs.filter((config) => config.exists).length, [configs])
  const inspectionUnavailable = inspectionUnavailableMessage !== null
  const visibleConfigs = useMemo(
    () =>
      inspectionUnavailable
        ? []
        : configs.filter(
            (config) => config.exists || config.status === 'invalid' || config.readError
          ),
    [configs, inspectionUnavailable]
  )
  const missingConfigs = useMemo(
    () =>
      configs.filter(
        (config) => !config.exists && config.status === 'missing' && !config.readError
      ),
    [configs]
  )
  const missingInspections = useMemo(
    () =>
      MCP_CONFIG_CANDIDATES.map(
        (candidate): LoadedMcpConfigInspection => ({
          ...inspectMcpConfigContent(candidate, null),
          absolutePath: joinPath(targetRootPath, candidate.relativePath)
        })
      ),
    [targetRootPath]
  )
  const serverCount = useMemo(() => countServers(configs), [configs])
  const canCreateStarter = detectedCount === 0 && !inspectionUnavailable

  const loadConfigs = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) {
      return
    }
    setLoading(true)
    setInspectionUnavailableMessage(null)

    try {
      if (connectionId && sshConnectionStatus !== 'connected') {
        if (mountedRef.current) {
          setConfigs(missingInspections)
          setInspectionUnavailableMessage('Connect this SSH repo to inspect or add MCP configs.')
        }
        return
      }

      if (!connectionId && !canInspectLocalMcpConfigRoot(targetRootPath, isWindows)) {
        if (mountedRef.current) {
          setConfigs(missingInspections)
          setInspectionUnavailableMessage('This workspace path is not available from this host.')
        }
        return
      }

      if (!connectionId && !(await window.api.shell.pathExists(targetRootPath))) {
        if (mountedRef.current) {
          setConfigs(missingInspections)
          setInspectionUnavailableMessage('This workspace path is not available on disk.')
        }
        return
      }

      const next = await loadMcpConfigInspections(targetRootPath, connectionId)
      if (mountedRef.current) {
        setConfigs(next)
      }
    } catch (error) {
      if (mountedRef.current) {
        setConfigs(missingInspections)
        setInspectionUnavailableMessage(
          extractIpcErrorMessage(error, 'Unable to inspect MCP configs.')
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [connectionId, isWindows, missingInspections, mountedRef, sshConnectionStatus, targetRootPath])

  const clearCreateConfirmResetTimer = useCallback((): void => {
    if (createConfirmResetTimerRef.current !== null) {
      window.clearTimeout(createConfirmResetTimerRef.current)
      createConfirmResetTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    void loadConfigs()
    return clearCreateConfirmResetTimer
  }, [clearCreateConfirmResetTimer, loadConfigs])

  const handleOpen = (config: LoadedMcpConfigInspection): void => {
    setActiveWorktree(targetWorktreeId)
    const targetGroupId = ensureWorktreeRootGroup(targetWorktreeId)
    openFile(
      {
        filePath: config.absolutePath,
        relativePath: config.candidate.relativePath,
        worktreeId: targetWorktreeId,
        language: 'json',
        mode: 'edit'
      },
      { targetGroupId }
    )
    setActiveView('terminal')
  }

  const handleCreateStarter = async (): Promise<void> => {
    if (!createConfirm) {
      clearCreateConfirmResetTimer()
      setCreateConfirm(true)
      createConfirmResetTimerRef.current = window.setTimeout(() => {
        createConfirmResetTimerRef.current = null
        if (mountedRef.current) {
          setCreateConfirm(false)
        }
      }, 3000)
      return
    }

    const target = joinPath(targetRootPath, '.mcp.json')
    try {
      // Why: v1 only creates the root workspace config so we do not need to
      // guess per-agent directory layouts or mutate agent-specific files.
      await window.api.fs.writeFile({ filePath: target, content: MCP_STARTER_CONFIG, connectionId })
      clearCreateConfirmResetTimer()
      if (mountedRef.current) {
        setCreateConfirm(false)
      }
      await loadConfigs()
      setActiveWorktree(targetWorktreeId)
      const targetGroupId = ensureWorktreeRootGroup(targetWorktreeId)
      openFile(
        {
          filePath: target,
          relativePath: '.mcp.json',
          worktreeId: targetWorktreeId,
          language: 'json',
          mode: 'edit'
        },
        { targetGroupId }
      )
      setActiveView('terminal')
      toast.success(
        translate('auto.components.settings.McpConfigSection.1f3665e35a', 'MCP config created'),
        {
          description: translate(
            'auto.components.settings.McpConfigSection.9ee215caf6',
            '.mcp.json'
          )
        }
      )
    } catch (error) {
      toast.error(extractIpcErrorMessage(error, 'Failed to create MCP config.'))
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {translate('auto.components.settings.McpConfigSection.55eea3ef47', 'MCP Configs')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.McpConfigSection.96f5609b04',
              'Inspect MCP server definitions that agents can use while working in this repo.'
            )}
          </p>
          {repo.connectionId ? (
            <p className="text-muted-foreground text-xs">
              {translate(
                'auto.components.settings.McpConfigSection.6bac9ddfc6',
                'SSH repos are read through the remote filesystem. Starter creation is limited to the workspace root config.'
              )}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void loadConfigs()}
            aria-label={translate(
              'auto.components.settings.McpConfigSection.f34c152dc0',
              'Refresh MCP configs'
            )}
          >
            {loading ? (
              <LoadingIndicator className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          {canCreateStarter ? (
            <Button
              variant={createConfirm ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => void handleCreateStarter()}
            >
              <Plus className="size-3.5" />
              {createConfirm
                ? translate(
                    'auto.components.settings.McpConfigSection.0a5c1ead54',
                    'Create empty config'
                  )
                : translate(
                    'auto.components.settings.McpConfigSection.82436439eb',
                    'Add MCP config'
                  )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-border/50 bg-muted/20 rounded-md border">
        <div className="border-border/50 text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs">
          <span>
            {detectedCount}{' '}
            {translate('auto.components.settings.McpConfigSection.251b96564a', 'detected ·')}{' '}
            {serverCount}{' '}
            {translate('auto.components.settings.McpConfigSection.3b224167ff', 'server')}
            {serverCount === 1 ? '' : 's'}
          </span>
          {loading ? <LoadingIndicator className="size-3.5" /> : null}
        </div>
        <div>
          {visibleConfigs.length === 0 ? (
            <div className="text-muted-foreground flex items-start gap-2 px-3 py-2.5 text-xs">
              {inspectionUnavailable ? (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <FileCode2 className="mt-0.5 size-3.5 shrink-0" />
              )}
              {inspectionUnavailable ? (
                <span>{inspectionUnavailableMessage}</span>
              ) : (
                <span>
                  {translate(
                    'auto.components.settings.McpConfigSection.b900cd6282',
                    'No MCP config found. Add an empty workspace config when you want this repo to define its own MCP servers.'
                  )}
                </span>
              )}
            </div>
          ) : (
            <div className="divide-border/50 divide-y">
              {visibleConfigs.map((config) => (
                <McpConfigFileRow
                  key={config.candidate.relativePath}
                  config={config}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          )}

          {!inspectionUnavailable ? <McpMissingConfigList missingConfigs={missingConfigs} /> : null}
        </div>
      </div>
    </section>
  )
}
