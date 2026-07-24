import { EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { getExternalEditorOpenCapability } from '@/lib/external-editor-open-capability'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'

import { EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT } from '../../../../shared/runtime-method-contracts/external-editor-contracts'
import type {
  ShellOpenExternalEditorResult,
  ShellOpenPathFailureReason
} from '../../../../shared/shell-open-types'

export type RuntimeRemoteSshSupport = 'not-needed' | 'checking' | 'supported' | 'unsupported'

export function getOpenInEntryAvailability(
  entry: { target: 'external-editor' | 'file-manager'; command?: string },
  context: {
    connectionId?: string | null
    runtimeEnvironmentId?: string | null
    runtimeRemoteSshSupport?: RuntimeRemoteSshSupport
  }
): { disabled: boolean; metadata?: string } {
  if (entry.target === 'file-manager') {
    return context.connectionId || context.runtimeEnvironmentId
      ? {
          disabled: true,
          metadata: translate('auto.components.sidebar.WorktreeOpenInMenu.localOnly', 'Local only')
        }
      : { disabled: false }
  }
  const capability = getExternalEditorOpenCapability({
    connectionId: context.connectionId,
    runtimeEnvironmentId: context.runtimeEnvironmentId,
    command: entry.command,
    runtimeRemoteSshSupported: context.runtimeRemoteSshSupport === 'supported'
  })
  if (!capability.allowed) {
    const checking =
      capability.reason === 'runtime-host-unsupported' &&
      context.runtimeRemoteSshSupport === 'checking'
    return {
      disabled: true,
      metadata: checking
        ? translate('auto.components.sidebar.WorktreeOpenInMenu.checkingHost', 'Checking host…')
        : capability.reason === 'runtime-host-unsupported'
          ? translate(
              'auto.components.sidebar.WorktreeOpenInMenu.hostUnsupported',
              'Host unsupported'
            )
          : translate('auto.components.sidebar.WorktreeOpenInMenu.localOnly', 'Local only')
    }
  }
  return capability.remote
    ? {
        disabled: false,
        metadata: translate('auto.components.sidebar.WorktreeOpenInMenu.remoteSsh', 'Remote SSH')
      }
    : { disabled: false }
}

function showOpenFailureToast(
  result: Exclude<ShellOpenExternalEditorResult, { ok: true }>,
  remote: boolean
): void {
  const reason: ShellOpenPathFailureReason = result.reason
  if (reason === 'remote-runtime-unsupported') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.remoteRuntimeUnsupported',
        'Opening this path in a local app is not available on this host.'
      )
    )
    return
  }
  if (reason === 'ssh-target-not-found' || reason === 'ssh-target-invalid') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.sshTargetUnavailable',
        'SSH host configuration is no longer available.'
      )
    )
    return
  }
  if (result.reason === 'ssh-alias-required') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.sshAliasRequired',
        'VS Code needs an SSH config alias for this host.'
      ),
      {
        description: translate(
          'auto.components.sidebar.WorktreeOpenInMenu.sshAliasRequiredDetail',
          'Add a Host alias for {{host}}:{{port}}, reconnect the workspace, then try again.',
          { host: result.host, port: result.port }
        )
      }
    )
    return
  }
  if (reason === 'remote-editor-unsupported') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.remoteEditorUnsupported',
        'This app cannot open SSH workspaces. Choose VS Code instead.'
      )
    )
    return
  }
  if (reason === 'not-absolute') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.f387af445b',
        'Workspace path is not a valid local path.'
      )
    )
    return
  }
  if (reason === 'not-found') {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.3921d3d9a5',
        'Workspace folder was not found.'
      ),
      {
        description: translate(
          'auto.components.sidebar.WorktreeOpenInMenu.0bed8727db',
          'It may have been moved or deleted. Refresh workspaces or remove it from Yiru.'
        )
      }
    )
    return
  }
  if (remote) {
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeOpenInMenu.remoteLaunchFailed',
        'Could not open the path in VS Code.'
      )
    )
    return
  }
  toast.error(
    translate(
      'auto.components.sidebar.WorktreeOpenInMenu.9a5381eb09',
      'Could not open workspace folder.'
    ),
    {
      description: translate(
        'auto.components.sidebar.WorktreeOpenInMenu.bd0e8159f8',
        'Check the editor command or file manager configuration on this machine.'
      )
    }
  )
}

export async function openWorktreePath(args: {
  target: 'file-manager' | 'external-editor'
  worktreePath: string
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  command?: string
}): Promise<void> {
  const runtimeEnvironmentId = args.runtimeEnvironmentId?.trim()
  const connectionId = args.connectionId?.trim()
  if (args.target === 'file-manager' && (runtimeEnvironmentId || connectionId)) {
    showOpenFailureToast({ ok: false, reason: 'remote-runtime-unsupported' }, false)
    return
  }

  let runtimeRemoteSshSupported = false
  if (args.target === 'external-editor' && runtimeEnvironmentId && connectionId) {
    try {
      runtimeRemoteSshSupported = await runtimeEnvironmentSupportsCapability(
        runtimeEnvironmentId,
        EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY
      )
    } catch {
      runtimeRemoteSshSupported = false
    }
  }
  if (args.target === 'external-editor') {
    const capability = getExternalEditorOpenCapability({
      runtimeEnvironmentId,
      connectionId,
      command: args.command,
      runtimeRemoteSshSupported
    })
    if (!capability.allowed) {
      showOpenFailureToast(
        {
          ok: false,
          reason:
            capability.reason === 'local-only-editor'
              ? 'remote-editor-unsupported'
              : 'remote-runtime-unsupported'
        },
        Boolean(connectionId)
      )
      return
    }
  }

  let result: ShellOpenExternalEditorResult
  try {
    result =
      args.target === 'file-manager'
        ? await window.api.shell.openInFileManager(args.worktreePath)
        : runtimeEnvironmentId && connectionId
          ? await callRuntimeRpc(
              { kind: 'environment', environmentId: runtimeEnvironmentId },
              EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT,
              { path: args.worktreePath, command: args.command, connectionId }
            )
          : await window.api.shell.openInExternalEditor({
              path: args.worktreePath,
              command: args.command,
              connectionId
            })
  } catch {
    showOpenFailureToast({ ok: false, reason: 'launch-failed' }, Boolean(connectionId))
    return
  }
  if (!result.ok) {
    showOpenFailureToast(result, Boolean(connectionId))
  }
}
