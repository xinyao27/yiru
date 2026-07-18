import type React from 'react'
import { LoadingIndicator } from '@/components/loading-indicator'
import { cn } from '@/lib/class-names'

export function AiVaultPanelSurface({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="@container/ai-vault flex h-full min-h-0 flex-col bg-sidebar">{children}</div>
  )
}

export function AiVaultPanelNotice({
  children,
  loading = false,
  tone = 'muted'
}: {
  children: React.ReactNode
  loading?: boolean
  tone?: 'muted' | 'destructive'
}): React.JSX.Element {
  return (
    <div
      role={loading ? 'status' : undefined}
      className={cn(
        'flex items-center gap-1.5 border-b border-sidebar-border px-3 py-2 text-[11px]',
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {loading ? <LoadingIndicator aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </div>
  )
}
