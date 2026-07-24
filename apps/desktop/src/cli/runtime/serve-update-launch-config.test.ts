import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { SERVE_UPDATE_HANDOFF_PATH_ENV } from '../../shared/serve-update-handoff'
import {
  buildServeUpdateChildEnvironment,
  resolveServeUpdateHandoffLaunchPath
} from './serve-update-launch-config'

describe('serve updater launch configuration', () => {
  const executable = '/Applications/Yiru.app/Contents/MacOS/Yiru'

  it('creates a handoff only for a supervised macOS foreground serve', () => {
    expect(
      resolveServeUpdateHandoffLaunchPath({
        executable,
        recipeJson: false,
        userDataPath: '/Users/test/Library/Application Support/yiru',
        platform: 'darwin'
      })
    ).toBe(join('/Users/test/Library/Application Support/yiru', 'serve-update-handoff.json'))
    expect(
      resolveServeUpdateHandoffLaunchPath({
        executable,
        recipeJson: true,
        userDataPath: '/tmp/yiru',
        platform: 'darwin'
      })
    ).toBeNull()
    expect(
      resolveServeUpdateHandoffLaunchPath({
        executable,
        recipeJson: false,
        userDataPath: '/tmp/yiru',
        platform: 'linux'
      })
    ).toBeNull()
    expect(
      resolveServeUpdateHandoffLaunchPath({
        executable: 'C:\\Program Files\\Yiru\\Yiru.exe',
        recipeJson: false,
        userDataPath: 'C:\\Users\\test\\AppData\\Roaming\\yiru',
        platform: 'win32'
      })
    ).toBeNull()
  })

  it('removes stale ancestor claims and stamps only a fresh supervised child', () => {
    const stale = { [SERVE_UPDATE_HANDOFF_PATH_ENV]: '/tmp/stale', SAFE: '1' }
    expect(buildServeUpdateChildEnvironment(stale, null)).toEqual({ SAFE: '1' })
    expect(buildServeUpdateChildEnvironment(stale, '/tmp/current')).toEqual({
      SAFE: '1',
      [SERVE_UPDATE_HANDOFF_PATH_ENV]: '/tmp/current'
    })
  })
})
