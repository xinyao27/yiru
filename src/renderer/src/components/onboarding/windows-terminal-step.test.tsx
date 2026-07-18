import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { GlobalSettings } from '../../../../shared/types'
import { WindowsTerminalStep } from './windows-terminal-step'

function createSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    terminalWindowsShell: 'powershell.exe',
    terminalWindowsWslDistro: null,
    terminalRightClickToPaste: true,
    ...overrides
  } as GlobalSettings
}

describe('WindowsTerminalStep', () => {
  it('renders default shell and right-click behavior choices', () => {
    const html = renderToStaticMarkup(
      <WindowsTerminalStep settings={createSettings()} updateSettings={vi.fn()} />
    )

    expect(html).toContain('Default Shell')
    expect(html).toContain('PowerShell')
    expect(html).toContain('Command Prompt')
    expect(html).toContain('Right-click behavior')
    expect(html).toContain('Paste on right-click')
    expect(html).toContain('Open context menu')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('keeps the WSL distro control visible when WSL is already selected', () => {
    const html = renderToStaticMarkup(
      <WindowsTerminalStep
        settings={createSettings({
          terminalWindowsShell: 'wsl.exe',
          terminalWindowsWslDistro: 'Debian'
        })}
        updateSettings={vi.fn()}
      />
    )

    expect(html).toContain('WSL')
    expect(html).toContain('WSL Distribution')
  })
})
