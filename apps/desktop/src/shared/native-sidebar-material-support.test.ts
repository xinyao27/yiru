import { describe, expect, it } from 'vite-plus/test'

import { supportsNativeSidebarMaterial } from './native-sidebar-material-support'

describe('supportsNativeSidebarMaterial', () => {
  it('supports macOS vibrancy', () => {
    expect(supportsNativeSidebarMaterial('darwin', '15.5.0')).toBe(true)
  })

  it('supports Windows Acrylic from Windows 11 22H2', () => {
    expect(supportsNativeSidebarMaterial('win32', '10.0.22621')).toBe(true)
    expect(supportsNativeSidebarMaterial('win32', '10.0.26100')).toBe(true)
  })

  it('falls back on older or unrecognized Windows releases', () => {
    expect(supportsNativeSidebarMaterial('win32', '10.0.22000')).toBe(false)
    expect(supportsNativeSidebarMaterial('win32', '')).toBe(false)
  })

  it('falls back on Linux', () => {
    expect(supportsNativeSidebarMaterial('linux', '6.12.0')).toBe(false)
  })
})
