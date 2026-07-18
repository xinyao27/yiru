// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import { MobilePageToolbar } from './mobile-page-toolbar'

describe('MobilePageToolbar', () => {
  it('labels the sidebar toggle explicitly when Yiru Mobile is visible in the sidebar', () => {
    const html = renderToStaticMarkup(
      <MobilePageToolbar showMobileButton onClose={vi.fn()} onToggleMobileSidebarButton={vi.fn()} />
    )

    expect(html).toContain('Hide from sidebar')
    expect(html).toContain('Configure in Settings')
    expect(html).not.toContain('Remove Yiru Mobile')
  })

  it('labels the restore action explicitly when Yiru Mobile is hidden from the sidebar', () => {
    const html = renderToStaticMarkup(
      <MobilePageToolbar
        showMobileButton={false}
        onClose={vi.fn()}
        onToggleMobileSidebarButton={vi.fn()}
      />
    )

    expect(html).toContain('Show in sidebar')
  })
})
