import { describe, expect, it } from 'vite-plus/test'

import electronBuilderConfig from './electron-builder.config.cjs'

describe('electron-builder config', () => {
  it('ships the Windows CLI shim only beside the native launcher', () => {
    expect(electronBuilderConfig.files).toContain('!resources/win32{,/**/*}')
    expect(electronBuilderConfig.win.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'resources/win32/bin/yiru.cmd',
          to: 'bin/yiru.cmd'
        })
      ])
    )
  })
})
