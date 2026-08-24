import type { UISlice } from '~renderer/store/slices/ui'

export function shouldShowWorktreeHistoryControls(activeView: UISlice['activeView']): boolean {
  return activeView === 'terminal'
}
