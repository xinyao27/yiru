import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createReleaseDesktopBuildMatrix } from './release-desktop-build-matrix.mjs'

const projectDir = resolve(import.meta.dirname, '../..')

describe('createReleaseDesktopBuildMatrix', () => {
  it('omits Windows when SignPath is not configured', () => {
    const result = createReleaseDesktopBuildMatrix({})

    expect(result.windowsEnabled).toBe(false)
    expect(result.matrix.include.map(({ platform }) => platform)).toEqual([
      'linux-x64',
      'linux-arm64'
    ])
  })

  it('includes Windows when both SignPath settings are configured', () => {
    const result = createReleaseDesktopBuildMatrix({
      SIGNPATH_API_TOKEN: 'token',
      SIGNPATH_ORGANIZATION_ID: 'organization'
    })

    expect(result.windowsEnabled).toBe(true)
    expect(result.matrix.include.map(({ platform }) => platform)).toEqual([
      'win',
      'linux-x64',
      'linux-arm64'
    ])
  })

  it.each([
    [{ SIGNPATH_API_TOKEN: 'token' }, 'SIGNPATH_ORGANIZATION_ID'],
    [{ SIGNPATH_ORGANIZATION_ID: 'organization' }, 'SIGNPATH_API_TOKEN']
  ])('rejects a partial SignPath configuration', (env, missingName) => {
    expect(() => createReleaseDesktopBuildMatrix(env)).toThrow(
      `Incomplete SignPath configuration: missing ${missingName}`
    )
  })
})

describe('release desktop platform workflow', () => {
  it('omits Windows releases through one SignPath-aware platform decision', () => {
    const releaseWorkflow = parse(
      readFileSync(resolve(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const cutJob = releaseWorkflow.jobs.cut
    const resolveStep = cutJob.steps.find(
      (step) => step.name === 'Resolve desktop release platforms'
    )
    const publishDraftsStep = cutJob.steps.find(
      (step) => step.name === 'Publish complete release-cut RC drafts from prior runs'
    )
    const publishReleaseSteps = releaseWorkflow.jobs['publish-release'].steps
    const removeWindowsAssetsStep = publishReleaseSteps.find(
      (step) => step.name === 'Remove disabled Windows release assets'
    )
    const verifyAssetsStep = publishReleaseSteps.find(
      (step) => step.name === 'Verify release assets complete'
    )

    expect(resolveStep.env.SIGNPATH_API_TOKEN).toBe('${{ secrets.SIGNPATH_API_TOKEN }}')
    expect(resolveStep.env.SIGNPATH_ORGANIZATION_ID).toBe('${{ vars.SIGNPATH_ORGANIZATION_ID }}')
    expect(resolveStep.run).toContain('release-desktop-build-matrix.mjs')
    expect(cutJob.outputs.desktop_matrix).toBe('${{ steps.desktop-platforms.outputs.matrix }}')
    expect(cutJob.outputs.windows_enabled).toBe(
      '${{ steps.desktop-platforms.outputs.windows_enabled }}'
    )
    expect(publishDraftsStep.env.YIRU_WINDOWS_RELEASE_ENABLED).toBe(
      '${{ steps.desktop-platforms.outputs.windows_enabled }}'
    )
    expect(removeWindowsAssetsStep.if).toBe("needs.cut.outputs.windows_enabled == 'false'")
    expect(removeWindowsAssetsStep.run).toContain('remove-disabled-windows-release-assets.mjs')
    expect(publishReleaseSteps.indexOf(removeWindowsAssetsStep)).toBeLessThan(
      publishReleaseSteps.indexOf(verifyAssetsStep)
    )
    expect(verifyAssetsStep.env.YIRU_WINDOWS_RELEASE_ENABLED).toBe(
      '${{ needs.cut.outputs.windows_enabled }}'
    )
  })
})
