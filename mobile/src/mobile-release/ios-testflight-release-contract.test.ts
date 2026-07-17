import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { REQUIRED_IOS_TESTFLIGHT_ENV_NAMES } from '../../scripts/verify-ios-testflight-env.mjs'

const projectRoot = resolve(import.meta.dirname, '../../..')
const workflowPath = join(projectRoot, '.github/workflows/mobile-ios-release.yml')
const fastfilePath = join(projectRoot, 'mobile/fastlane/Fastfile')
const validationScriptPath = join(projectRoot, 'mobile/scripts/verify-ios-testflight-env.mjs')
const requiredSecretNames = REQUIRED_IOS_TESTFLIGHT_ENV_NAMES

function envWithoutTestflightSecrets() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !requiredSecretNames.includes(name))
  )
}

describe('iOS TestFlight release contract', () => {
  it('defaults manual and tag releases to internal TestFlight', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const input = workflow.on.workflow_dispatch.inputs.testflight_distribution
    const buildStep = workflow.jobs['ios-build'].steps.find(
      (step: { name?: string }) => step.name === 'Build and upload to TestFlight'
    )

    expect(input).toMatchObject({
      type: 'choice',
      default: 'internal',
      options: ['internal', 'external']
    })
    expect(buildStep.env.TESTFLIGHT_DISTRIBUTION).toContain("|| 'internal'")
  })

  it('validates every TestFlight credential before native build work', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const steps = workflow.jobs['ios-build'].steps
    const validationStep = steps.find(
      (step: { name?: string }) => step.name === 'Validate TestFlight credentials'
    )
    const prebuildStep = steps.find((step: { name?: string }) => step.name === 'Expo prebuild')

    expect(validationStep.run).toContain('verify-ios-testflight-env.mjs')
    for (const name of requiredSecretNames) {
      expect(validationStep.env[name], name).toBe(`\${{ secrets.${name} }}`)
    }
    expect(steps.indexOf(validationStep)).toBeLessThan(steps.indexOf(prebuildStep))
  })

  it('fails with one actionable list when credentials are missing', () => {
    const result = spawnSync(process.execPath, [validationScriptPath], {
      encoding: 'utf8',
      env: envWithoutTestflightSecrets()
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      `Missing iOS TestFlight credentials: ${requiredSecretNames.join(', ')}`
    )
  })

  it('accepts a complete credential set without printing secret values', () => {
    const secretMarker = 'must-not-appear'
    const result = spawnSync(process.execPath, [validationScriptPath], {
      encoding: 'utf8',
      env: {
        ...envWithoutTestflightSecrets(),
        ...Object.fromEntries(requiredSecretNames.map((name) => [name, secretMarker]))
      }
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('iOS TestFlight credentials are configured')
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretMarker)
  })

  it('uploads internally by default while preserving explicit external distribution', () => {
    const fastfile = readFileSync(fastfilePath, 'utf8')

    expect(fastfile).toContain('ENV.fetch("TESTFLIGHT_DISTRIBUTION", "internal")')
    expect(fastfile).toContain('distribute_external: false')
    expect(fastfile).toContain('distribute_external: true')
    expect(fastfile).toContain('TESTFLIGHT_GROUPS = ["peeps"].freeze')
    expect(fastfile).toContain('groups: TESTFLIGHT_GROUPS')
  })
})
