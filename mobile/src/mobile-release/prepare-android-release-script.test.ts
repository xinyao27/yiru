import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vite-plus/test'

const scriptPath = fileURLToPath(
  new URL('../../scripts/prepare-android-release.mjs', import.meta.url)
)
const committedAppConfigPath = fileURLToPath(new URL('../../app.json', import.meta.url))

const appConfig = {
  expo: {
    version: '0.0.1',
    android: {
      versionCode: 1
    }
  }
}

let tempDirs: string[] = []

function createAppConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'yiru-android-release-'))
  tempDirs.push(dir)
  const configPath = join(dir, 'app.json')
  const contents = `${JSON.stringify(appConfig, null, 2)}\n`
  writeFileSync(configPath, contents)
  return { configPath, contents }
}

describe('prepare Android release script', () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { force: true, recursive: true })
    }
    tempDirs = []
  })

  it('keeps the new mobile package identity on its first release version', () => {
    const committedConfig = JSON.parse(readFileSync(committedAppConfigPath, 'utf8'))

    expect(committedConfig.expo.version).toBe('0.0.1')
    expect(committedConfig.expo.ios).toMatchObject({
      buildNumber: '1',
      bundleIdentifier: 'com.xinyao27.yiru.mobile'
    })
    expect(committedConfig.expo.android).toMatchObject({
      package: 'com.xinyao27.yiru.mobile',
      versionCode: 1
    })
  })

  it('uses committed Android release identity without mutating app config', () => {
    const { configPath, contents } = createAppConfig()

    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_APP_CONFIG_PATH: configPath,
        MOBILE_ANDROID_PUBLISH_RELEASE: 'true'
      }
    })

    expect(output).toContain('Prepared Yiru Mobile Android 0.0.1 (1)')
    expect(output).toContain('Release tag: mobile-android-v0.0.1')
    expect(readFileSync(configPath, 'utf8')).toBe(contents)
  })

  it('rejects release-only Android versionCode bumps', () => {
    const { configPath } = createAppConfig()

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_APP_CONFIG_PATH: configPath,
        MOBILE_ANDROID_BUMP_VERSION_CODE: 'true'
      }
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Android versionCode changes must be committed in mobile/app.json before release'
    )
  })

  it('rejects release versions that do not match committed app config', () => {
    const { configPath } = createAppConfig()

    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_APP_CONFIG_PATH: configPath,
        MOBILE_ANDROID_RELEASE_VERSION: '0.0.23'
      }
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'MOBILE_ANDROID_RELEASE_VERSION must match the committed mobile app version'
    )
  })
})
