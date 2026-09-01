import type {
  ShellServicesTerminalMountInput,
  ShellServicesTerminalMountOutput
} from '@yiru/runtime-protocol/contract'
import { planMobileTerminalTabMount } from '~renderer/application-shell/mobile-terminal-tab-mount'
import { useAppStore } from '~renderer/store/state'
import { requestBackgroundTerminalWorktreeMount } from '~renderer/terminal/background-terminal-worktree-mount'

import { hasRegisteredRuntimeTerminalTab } from './sync-runtime-graph'

export function mountTerminalTabViaShell(
  input: ShellServicesTerminalMountInput
): ShellServicesTerminalMountOutput {
  const mount = planMobileTerminalTabMount(useAppStore.getState(), input, {
    isTabMounted: hasRegisteredRuntimeTerminalTab
  })
  if (!mount) {
    return { accepted: false }
  }
  requestBackgroundTerminalWorktreeMount(mount)
  return { accepted: true }
}
