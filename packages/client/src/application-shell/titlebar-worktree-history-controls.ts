import type { UISlice } from '~renderer/application-shell/state/slice'

export function shouldShowWorktreeHistoryControls(activeView: UISlice['activeView']): boolean {
  return activeView === 'terminal'
}
