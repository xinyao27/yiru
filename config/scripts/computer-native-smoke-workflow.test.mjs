import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')
const computerWorkflowPath = join(projectDir, '.github/workflows/computer-native-smoke.yml')

describe('computer-use local e2e and native smoke contracts', () => {
  it('runs computer-use e2e files serially because they share desktop focus', () => {
    const config = readFileSync(join(projectDir, 'tests/e2e/vitest.config.ts'), 'utf8')

    expect(config).toContain('fileParallelism: false')
  })

  it('guards e2e source against fragile fixed waits and stale element indexes', () => {
    const driver = readFileSync(join(projectDir, 'tests/e2e/helpers/computer-driver.ts'), 'utf8')
    const cliDriver = readFileSync(
      join(projectDir, 'tests/e2e/helpers/computer-cli-driver.ts'),
      'utf8'
    )
    const windowsStoreE2e = readFileSync(
      join(projectDir, 'tests/e2e/computer-windows-store.e2e.ts'),
      'utf8'
    )

    expect(driver).not.toContain('await delay(3500)')
    expect(driver).toContain("await waitForComputerWindowTitle('gedit', fileName, 15000)")
    expect(cliDriver).toContain('YIRU_DEV_USER_DATA_PATH')
    expect(cliDriver).toContain('yiru-computer-runtime-')
    expect(cliDriver).toContain('retryMissingRuntimeMetadata')
    expect(cliDriver).toContain('Could not read Yiru runtime metadata')
    expect(cliDriver).toContain("'serve', '--no-pairing', '--json'")

    expect(windowsStoreE2e).toMatch(
      /for \(const buttonName of \['One', 'Plus', 'Two', 'Equals'\]\) \{[\s\S]*findRoleIndex\(state\.result\.snapshot\.treeText, `button \$\{buttonName\}`\)[\s\S]*state = parseJsonOutput/
    )
    expect(windowsStoreE2e).not.toMatch(/const one = findRoleIndex/)
    expect(windowsStoreE2e).not.toMatch(/for \(const index of \[one, plus, two, equals\]\)/)
  })

  it('triggers on computer-use shared contracts, scripts, and agent skill changes', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const triggerPaths = workflow.on.pull_request.paths

    expect(triggerPaths).toEqual(
      expect.arrayContaining([
        'config/scripts/computer-native-smoke-workflow.test.mjs',
        'config/scripts/computer-use-skill-guidance.test.mjs',
        'config/scripts/computer-use-smoke.mjs',
        'config/scripts/computer-use-smoke.test.mjs',
        'skills/computer-use/SKILL.md',
        'src/main/computer/**',
        'src/main/runtime/rpc/dispatcher.ts',
        'src/main/runtime/rpc/errors.ts',
        'src/main/runtime/rpc/methods/computer*.ts',
        'src/shared/computer-use-*.ts'
      ])
    )
    expect(triggerPaths).not.toContain('src/shared/runtime-types.ts')
  })

  it('runs focused computer-use regression tests in the PR native-smoke job', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const nativeSmokeRuns = workflow.jobs['native-smoke'].steps
      .map((step) => step.run)
      .filter((run) => typeof run === 'string')
    const regressionRun = nativeSmokeRuns.find((run) => run.includes('pnpm vp test run'))
    const expectedRegressionFiles = [
      'config/scripts/computer-native-smoke-workflow.test.mjs',
      'config/scripts/computer-use-skill-guidance.test.mjs',
      'config/scripts/computer-use-smoke.test.mjs',
      'src/main/computer/computer-provider-lifecycle.test.ts',
      'src/main/computer/computer-provider-unavailable-message.test.ts',
      'src/main/computer/sidecar-client.test.ts',
      'src/main/computer/macos-native-provider-client.test.ts',
      'src/main/computer/macos-native-provider-socket.test.ts',
      'src/main/computer/macos-computer-use-permissions.test.ts',
      'src/main/computer/macos-computer-use-permission-status.test.ts',
      'src/main/computer/desktop-script-provider-client.test.ts',
      'src/main/computer/desktop-script-provider-cache.test.ts',
      'src/main/computer/desktop-script-provider-actions.test.ts',
      'src/main/computer/desktop-script-provider-cache-lifecycle.test.ts',
      'src/main/computer/desktop-script-provider-errors.test.ts',
      'src/main/computer/desktop-script-provider-action-errors.test.ts',
      'src/shared/computer-use-error-recovery.test.ts',
      'src/shared/computer-use-key-spec.test.ts',
      'src/cli/format.test.ts',
      'src/cli/handlers/computer.test.ts',
      'src/cli/handlers/computer-action-routing.test.ts',
      'src/cli/handlers/computer-action-validation.test.ts',
      'src/cli/handlers/computer-state-formatting.test.ts',
      'src/cli/specs/computer.test.ts',
      'src/cli/index.test.ts',
      'src/main/runtime/rpc/dispatcher-computer-errors.test.ts',
      'src/main/runtime/rpc/errors.test.ts',
      'src/main/runtime/rpc/methods/computer.test.ts',
      'src/main/runtime/rpc/methods/computer-actions.test.ts',
      'src/cli/runtime/envelope-schema.test.ts',
      'src/shared/remote-runtime-client.test.ts'
    ]

    expect(regressionRun).toBeTruthy()
    for (const file of expectedRegressionFiles) {
      expect(regressionRun).toContain(file)
    }
  })

  it('boots the built daemon under plain Node in the PR native-smoke job after the main build', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const steps = workflow.jobs['native-smoke'].steps
    const runs = steps.map((step) => step.run).filter((run) => typeof run === 'string')
    const buildIndex = runs.indexOf('pnpm build:electron-vite')
    const daemonSmokeIndex = runs.indexOf('node config/scripts/daemon-boot-smoke.mjs')

    expect(daemonSmokeIndex, 'native-smoke must boot the built daemon').toBeGreaterThanOrEqual(0)
    expect(
      buildIndex,
      'daemon boot smoke must run after the main bundle is built'
    ).toBeGreaterThanOrEqual(0)
    expect(daemonSmokeIndex).toBeGreaterThan(buildIndex)
  })

  it('runs the Windows workspace-close daemon repro after the main build', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const steps = workflow.jobs['native-smoke'].steps
    const buildIndex = steps.findIndex((step) => step.run === 'pnpm build:electron-vite')
    const reproIndex = steps.findIndex(
      (step) => step.run === 'node config/scripts/windows-daemon-workspace-close-repro.mjs'
    )

    expect(reproIndex).toBeGreaterThan(buildIndex)
    expect(steps[reproIndex].if).toBe("runner.os == 'Windows'")
    expect(workflow.on.pull_request.paths).toContain(
      'config/scripts/windows-daemon-workspace-close-repro.mjs'
    )
  })

  it('re-runs the native-smoke job when the daemon bundle graph changes', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const triggerPaths = workflow.on.pull_request.paths

    expect(triggerPaths).toEqual(
      expect.arrayContaining([
        'config/scripts/daemon-boot-smoke.mjs',
        'config/scripts/windows-daemon-workspace-close-repro.mjs',
        'electron.vite.config.ts',
        'build-plugins/**',
        'src/main/daemon/**'
      ])
    )
  })

  it('keeps computer-use e2e local instead of running it in GitHub Actions', () => {
    const workflow = parse(readFileSync(computerWorkflowPath, 'utf8'))
    const workflowRuns = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.map((step) => step.run).filter((run) => typeof run === 'string')
    )

    expect(Object.keys(workflow.jobs)).toEqual(['native-smoke'])
    expect(workflowRuns.join('\n')).not.toContain('test:e2e')
    expect(workflowRuns.join('\n')).not.toContain('playwright')
    expect(workflow.on.schedule).toBeUndefined()
    expect(workflow.on.workflow_dispatch).toBeUndefined()
  })
})
