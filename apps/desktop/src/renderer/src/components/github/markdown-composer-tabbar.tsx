import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

export type ComposerTab = 'write' | 'preview'

export function GitHubMarkdownComposerTabbar({
  activeTab,
  onTabChange,
  children
}: {
  activeTab: ComposerTab
  onTabChange: (tab: ComposerTab) => void
  children: ReactNode
}): React.JSX.Element {
  const tabClassName = (isActive: boolean): string =>
    cn(
      'inline-flex h-auto min-w-[72px] items-center justify-center gap-0 whitespace-normal border-0 px-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:bg-accent',
      isActive && '-mb-px bg-background text-foreground'
    )

  return (
    <div className="flex min-h-10 items-stretch justify-between gap-2 border-b border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--muted)_28%,var(--background))]">
      <div className="flex items-stretch" role="tablist">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          role="tab"
          aria-selected={activeTab === 'write'}
          className={tabClassName(activeTab === 'write')}
          onClick={() => onTabChange('write')}
        >
          {translate('auto.components.github.GitHubMarkdownComposer.c91f0a2b14', 'Write')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          role="tab"
          aria-selected={activeTab === 'preview'}
          className={tabClassName(activeTab === 'preview')}
          onClick={() => onTabChange('preview')}
        >
          {translate('auto.components.github.GitHubMarkdownComposer.d82b1e3f05', 'Preview')}
        </Button>
      </div>
      {activeTab === 'write' ? (
        <div className="flex min-w-0 flex-1 items-center justify-end overflow-x-auto">
          {children}
        </div>
      ) : null}
    </div>
  )
}
