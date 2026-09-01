import { spawn, type ChildProcess } from 'node:child_process'

import { getCommitMessageAgentSpec } from '@yiru/runtime-protocol/workbench/commit-message/agent-spec'
import {
  planAgentBinary,
  type CommitMessagePlan
} from '@yiru/runtime-protocol/workbench/commit-message/plan'
import type { TuiAgent } from '@yiru/runtime-protocol/workbench/types'

import { wslAwareSpawn } from '../git/runner/runner'
import { getSpawnArgsForWindows } from '../platform/windows-host'
import { resolveCliCommand } from '../runtime/cli-command'
import { formatAgentCliFailureMessage } from './generation-failure'
import { GENERATION_TIMEOUT_MS, MAX_AGENT_OUTPUT_BYTES } from './generation-limits'
import type {
  CommitMessageModelDiscoveryLocalOptions,
  DiscoverCommitMessageModelsResult
} from './generation-types'
import { buildWslLauncherEnv, killProcessTree } from './local-generation'

function toModelDiscoveryCapability(
  spec: NonNullable<ReturnType<typeof getCommitMessageAgentSpec>>,
  models = spec.models,
  defaultModelId = spec.defaultModelId
): Extract<DiscoverCommitMessageModelsResult, { success: true }> {
  return {
    success: true,
    capability: {
      id: spec.id,
      label: spec.label,
      modelSource: spec.modelSource,
      defaultModelId,
      models
    },
    models,
    defaultModelId
  }
}

function finalizeModelDiscoveryOutput(
  spec: NonNullable<ReturnType<typeof getCommitMessageAgentSpec>>,
  stdout: string,
  stderr: string,
  code: number | null
): DiscoverCommitMessageModelsResult {
  if (code !== 0) {
    console.error('[commit-message] Model discovery failed:', {
      label: spec.label,
      exitCode: code,
      stdout,
      stderr
    })
    return {
      success: false,
      error: formatAgentCliFailureMessage(spec.label, stdout, stderr, code)
    }
  }
  let models = spec.modelDiscovery?.parse(stdout) ?? []
  if (models.length === 0 && stderr.trim()) {
    // Why: Pi currently writes its successful `--list-models` table to stderr,
    // so exit code 0 must still allow stderr-backed discovery.
    models = spec.modelDiscovery?.parse(stderr) ?? []
  }
  if (models.length === 0) {
    if (spec.models.length > 0) {
      console.warn('[commit-message] Model discovery returned no models; using static fallback:', {
        label: spec.label
      })
      return toModelDiscoveryCapability(spec, spec.models, spec.defaultModelId)
    }
    return { success: false, error: `${spec.label} returned no available models.` }
  }
  const defaultModelId = models.some((model) => model.id === spec.defaultModelId)
    ? spec.defaultModelId
    : models[0].id
  return toModelDiscoveryCapability(spec, models, defaultModelId)
}

function planModelDiscovery(
  spec: NonNullable<ReturnType<typeof getCommitMessageAgentSpec>>,
  agentCommandOverride?: string
): { ok: true; plan: CommitMessagePlan } | { ok: false; error: string } {
  const modelDiscovery = spec.modelDiscovery
  if (!modelDiscovery) {
    return { ok: false, error: `${spec.label} does not support dynamic model discovery.` }
  }
  const command = planAgentBinary(modelDiscovery.binary, agentCommandOverride)
  if (!command.ok) {
    return command
  }
  return {
    ok: true,
    plan: {
      binary: command.binary,
      args: [...command.prefixArgs, ...modelDiscovery.args],
      stdinPayload: null,
      label: spec.label
    }
  }
}

export async function discoverCommitMessageModelsLocal(
  agentId: TuiAgent,
  env: NodeJS.ProcessEnv | undefined,
  agentCommandOverride?: string,
  options: CommitMessageModelDiscoveryLocalOptions = {}
): Promise<DiscoverCommitMessageModelsResult> {
  const spec = getCommitMessageAgentSpec(agentId)
  if (!spec) {
    return { success: false, error: `Agent "${agentId}" does not support AI commit messages.` }
  }

  if (spec.modelSource === 'static' || !spec.modelDiscovery) {
    return toModelDiscoveryCapability(spec)
  }

  return new Promise((resolve) => {
    let child: ChildProcess
    const spawnEnv = env ?? process.env
    try {
      const planned = planModelDiscovery(spec, agentCommandOverride)
      if (!planned.ok) {
        resolve({ success: false, error: planned.error })
        return
      }
      if (process.platform === 'win32' && options.wslDistro) {
        child = wslAwareSpawn(planned.plan.binary, planned.plan.args, {
          cwd: options.cwd,
          env: buildWslLauncherEnv(env),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          wslDistro: options.wslDistro,
          useWslLoginShell: true
        })
      } else {
        const resolvedBinary =
          process.platform === 'win32'
            ? resolveCliCommand(planned.plan.binary, {
                pathEnv: spawnEnv.PATH ?? spawnEnv.Path ?? null
              })
            : planned.plan.binary
        const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolvedBinary, planned.plan.args)
        child = spawn(spawnCmd, spawnArgs, {
          env: spawnEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        })
      }
    } catch (error) {
      console.error('[commit-message] Failed to spawn model discovery:', error)
      resolve({
        success: false,
        error: `${spec.label} model discovery could not be started. Check the agent CLI configuration and try again.`
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let outputLimitExceeded = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let detachChildListeners = (): void => {}
    const finish = (result: DiscoverCommitMessageModelsResult): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      detachChildListeners()
      resolve(result)
    }
    timer = setTimeout(() => {
      killProcessTree(child)
      finish({
        success: false,
        error: `${spec.label} model discovery timed out after ${GENERATION_TIMEOUT_MS / 1000}s.`
      })
    }, GENERATION_TIMEOUT_MS)

    const onData = (chunk: Buffer, append: (text: string) => void): void => {
      if (stdout.length + stderr.length + chunk.byteLength > MAX_AGENT_OUTPUT_BYTES) {
        outputLimitExceeded = true
        killProcessTree(child)
        finish({ success: false, error: `${spec.label} returned too much model data.` })
        return
      }
      append(chunk.toString('utf-8'))
    }

    const onStdoutData = (chunk: Buffer): void => onData(chunk, (text) => (stdout += text))
    const onStderrData = (chunk: Buffer): void => onData(chunk, (text) => (stderr += text))
    const onError = (error: Error): void => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        finish({
          success: false,
          error: `${spec.modelDiscovery?.binary ?? spec.binary} not found on PATH. Install ${spec.label} to discover models.`
        })
        return
      }
      finish({
        success: false,
        error: `${spec.label} model discovery failed to start. Check the agent CLI configuration and try again.`
      })
    }
    const onClose = (code: number | null): void => {
      if (outputLimitExceeded) {
        finish({ success: false, error: `${spec.label} returned too much model data.` })
        return
      }
      if (code !== 0) {
        finish(finalizeModelDiscoveryOutput(spec, stdout, stderr, code))
        return
      }
      finish(finalizeModelDiscoveryOutput(spec, stdout, stderr, code))
    }

    child.stdout?.on('data', onStdoutData)
    child.stderr?.on('data', onStderrData)
    child.on('error', onError)
    child.on('close', onClose)
    detachChildListeners = () => {
      child.stdout?.off?.('data', onStdoutData)
      child.stderr?.off?.('data', onStderrData)
      child.off?.('error', onError)
      child.off?.('close', onClose)
    }
  })
}
