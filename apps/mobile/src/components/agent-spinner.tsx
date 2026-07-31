import { View } from 'react-native'

import { cn } from '~/style/class-names'

import { LoadingIndicator } from './loading-indicator'

type WorktreeStatus = 'working' | 'active' | 'permission' | 'done' | 'inactive'

// Why: states and sizing mirror the desktop StatusIndicator so worktree status
// reads consistently; working delegates to the user's configured loader.
const STATUS_COLOR_CLASSES: Record<WorktreeStatus, string> = {
  working: '',
  active: 'bg-emerald-500',
  done: 'bg-emerald-500',
  permission: 'bg-red-500',
  inactive: 'bg-status-neutral'
}

export function AgentSpinner({ status }: { status: WorktreeStatus }) {
  const colorClassName = STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.inactive

  if (status === 'working') {
    return <LoadingIndicator size={16} />
  }

  return <View className={cn('h-3 w-3 rounded-full', colorClassName)} />
}
