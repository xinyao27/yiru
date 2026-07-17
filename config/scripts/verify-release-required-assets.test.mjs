import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractManifestAssetNames,
  getRequiredReleaseAssetNames,
  getWindowsReleaseAssetNames,
  readWindowsReleaseEnabled,
  verifyRequiredReleaseAssets
} from './verify-release-required-assets.mjs'

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn(async () => body),
    text: vi.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body)))
  }
}

function releaseWithAssets(tag, assetNames) {
  return {
    tag_name: tag,
    draft: true,
    prerelease: false,
    assets: assetNames.map((name, index) => ({
      id: index + 1,
      name,
      state: 'uploaded',
      size: 123
    }))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRequiredReleaseAssetNames', () => {
  it('includes both mac updater ZIP names for the tag version', () => {
    expect(getRequiredReleaseAssetNames('v1.4.27')).toEqual(
      expect.arrayContaining([
        'Yiru-1.4.27-mac.zip',
        'Yiru-1.4.27-mac.zip.blockmap',
        'Yiru-1.4.27-arm64-mac.zip',
        'Yiru-1.4.27-arm64-mac.zip.blockmap'
      ])
    )
  })

  it('includes x64 and arm64 Linux assets', () => {
    expect(getRequiredReleaseAssetNames('v1.4.27')).toEqual(
      expect.arrayContaining([
        'latest-linux-arm64.yml',
        'yiru-linux.AppImage',
        'yiru-linux-arm64.AppImage',
        'yiru_1.4.27_amd64.deb',
        'yiru_1.4.27_arm64.deb',
        'yiru-1.4.27.x86_64.rpm',
        'yiru-1.4.27.aarch64.rpm'
      ])
    )
  })

  it('omits Windows assets when Windows publishing is disabled', () => {
    const required = getRequiredReleaseAssetNames('v1.4.27', { includeWindows: false })

    expect(required).not.toEqual(
      expect.arrayContaining([
        'latest.yml',
        'yiru-windows-setup.exe',
        'yiru-windows-setup.exe.blockmap'
      ])
    )
    expect(required).toEqual(
      expect.arrayContaining(['latest-mac.yml', 'latest-linux.yml', 'yiru-macos-arm64.dmg'])
    )
  })

  it('keeps the forbidden Windows asset list aligned with required assets', () => {
    expect(getWindowsReleaseAssetNames()).toEqual([
      'latest.yml',
      'yiru-windows-setup.exe',
      'yiru-windows-setup.exe.blockmap'
    ])
    expect(getRequiredReleaseAssetNames('v1.4.27')).toEqual(
      expect.arrayContaining(getWindowsReleaseAssetNames())
    )
  })
})

describe('readWindowsReleaseEnabled', () => {
  it('defaults to requiring Windows assets', () => {
    expect(readWindowsReleaseEnabled({})).toBe(true)
  })

  it('parses explicit workflow output values', () => {
    expect(readWindowsReleaseEnabled({ YIRU_WINDOWS_RELEASE_ENABLED: 'true' })).toBe(true)
    expect(readWindowsReleaseEnabled({ YIRU_WINDOWS_RELEASE_ENABLED: 'false' })).toBe(false)
  })

  it('rejects unexpected values', () => {
    expect(() => readWindowsReleaseEnabled({ YIRU_WINDOWS_RELEASE_ENABLED: 'sometimes' })).toThrow(
      'YIRU_WINDOWS_RELEASE_ENABLED must be "true" or "false"'
    )
  })
})

describe('extractManifestAssetNames', () => {
  it('extracts relative and absolute manifest asset names', () => {
    expect(
      extractManifestAssetNames(
        [
          'files:',
          '  - url: Yiru-1.4.27-arm64-mac.zip',
          '  - url: https://example.com/downloads/yiru-windows-setup.exe',
          'path: yiru-linux.AppImage'
        ].join('\n')
      )
    ).toEqual(['Yiru-1.4.27-arm64-mac.zip', 'yiru-windows-setup.exe', 'yiru-linux.AppImage'])
  })
})

describe('verifyRequiredReleaseAssets', () => {
  it('accepts a complete macOS and Linux release without Windows assets', async () => {
    const tag = 'v1.4.27'
    const required = getRequiredReleaseAssetNames(tag, { includeWindows: false })
    const release = releaseWithAssets(tag, required)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([release]))
      .mockResolvedValue(jsonResponse('version: 1.4.27\n'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRequiredReleaseAssets({
        repo: 'xinyao27/yiru',
        tag,
        token: 'token',
        includeWindows: false
      })
    ).resolves.toEqual(expect.objectContaining({ tag }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects stale Windows assets when Windows publishing is disabled', async () => {
    const tag = 'v1.4.27'
    const required = getRequiredReleaseAssetNames(tag, { includeWindows: false })
    const release = releaseWithAssets(tag, [...required, 'latest.yml'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse([release])))

    await expect(
      verifyRequiredReleaseAssets({
        repo: 'xinyao27/yiru',
        tag,
        token: 'token',
        includeWindows: false
      })
    ).rejects.toThrow('Unexpected Windows assets: latest.yml')
  })

  it('fails when a manifest-referenced asset has not been uploaded', async () => {
    const tag = 'v1.4.27'
    const required = getRequiredReleaseAssetNames(tag)
    const assets = required.filter((name) => name !== 'Yiru-1.4.27-arm64-mac.zip')
    const release = releaseWithAssets(tag, assets)
    const latestMacAsset = release.assets.find((asset) => asset.name === 'latest-mac.yml')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([release]))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            'version: 1.4.27',
            'files:',
            '  - url: Yiru-1.4.27-arm64-mac.zip',
            '    sha512: test',
            'path: Yiru-1.4.27-arm64-mac.zip'
          ].join('\n')
        )
      )
      .mockResolvedValue(jsonResponse('version: 1.4.27\n'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRequiredReleaseAssets({ repo: 'xinyao27/yiru', tag, token: 'token' })
    ).rejects.toThrow('Missing: Yiru-1.4.27-arm64-mac.zip')
    expect(latestMacAsset).toBeTruthy()
  })

  it('checks assets referenced by the Linux arm64 updater manifest', async () => {
    const tag = 'v1.4.27'
    const required = getRequiredReleaseAssetNames(tag)
    const release = releaseWithAssets(tag, required)
    const arm64Manifest = release.assets.find((asset) => asset.name === 'latest-linux-arm64.yml')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([release]))
      .mockResolvedValueOnce(jsonResponse('version: 1.4.27\n'))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            'version: 1.4.27',
            'files:',
            '  - url: yiru-linux-arm64.AppImage.blockmap',
            'path: yiru-linux-arm64.AppImage'
          ].join('\n')
        )
      )
      .mockResolvedValue(jsonResponse('version: 1.4.27\n'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRequiredReleaseAssets({ repo: 'xinyao27/yiru', tag, token: 'token' })
    ).rejects.toThrow('Missing: yiru-linux-arm64.AppImage.blockmap')
    expect(arm64Manifest).toBeTruthy()
  })
})
