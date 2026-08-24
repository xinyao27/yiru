import {
  clampOrchestrationAskTimeoutMs,
  resolveOrchestrationAskClientTimeoutMs
} from '~shared/orchestration-ask-timeout'
import { orchestrationMigrationData } from '~shared/orchestration-rpc-contract'

import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  callOrchestrationMutation,
  GATE_STATUS_VALUES,
  getOptionalChoiceFlag,
  getOptionalPositiveIntegerValueFlag,
  isDevCliInvocation
} from './orchestration-handler-flags'
import {
  resolveCoordinatorTerminalHandle,
  resolveOrchestrationTerminalHandle
} from './orchestration-handler-terminal'

export const ORCHESTRATION_DISPATCH_HANDLERS: Record<string, CommandHandler> = {
  'orchestration dispatch': async ({ flags, client, cwd, json }) => {
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const dryRun = flags.has('dry-run') ? true : undefined
    const returnPreamble = flags.has('return-preamble') ? true : undefined
    const to = dryRun ? getOptionalStringFlag(flags, 'to') : getRequiredStringFlag(flags, 'to')
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.dispatch,
      {
        task: getRequiredStringFlag(flags, 'task'),
        run: getOptionalStringFlag(flags, 'run'),
        to,
        from,
        inject: flags.has('inject') ? true : undefined,
        dryRun,
        returnPreamble,
        devMode: isDevCliInvocation()
      }
    )
    printResult(result, json, (value) => {
      if (value.dispatch === null) {
        return value.preamble
      }
      const base = `Dispatched ${value.dispatch.task_id} -> ${value.dispatch.id} [${value.dispatch.status}]`
      return value.preamble ? `${base}\n\n--- Preamble ---\n${value.preamble}` : base
    })
  },
  'orchestration ask': async ({ flags, client, cwd, json }) => {
    const parsedTimeoutMs = getOptionalPositiveIntegerValueFlag(flags, 'timeout-ms')
    const timeoutMs = clampOrchestrationAskTimeoutMs(parsedTimeoutMs)
    const from = await resolveOrchestrationTerminalHandle(flags, cwd, client, 'from')
    const question = getOptionalStringFlag(flags, 'question')
    const resume = getOptionalStringFlag(flags, 'resume')
    if ((question ? 1 : 0) + (resume ? 1 : 0) !== 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Choose exactly one of --question or --resume.'
      )
    }
    if (resume && flags.has('options')) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--options is only valid when creating a new question.'
      )
    }
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.ask,
      {
        to: getOptionalStringFlag(flags, 'to'),
        run: getOptionalStringFlag(flags, 'run'),
        question,
        resume,
        options: getOptionalStringFlag(flags, 'options'),
        timeoutMs: parsedTimeoutMs === undefined ? undefined : timeoutMs,
        from
      },
      {
        timeoutMs: resolveOrchestrationAskClientTimeoutMs(parsedTimeoutMs),
        orchestrationCapability: getOptionalStringFlag(flags, 'dispatch-capability')
      }
    )
    if (json) {
      console.log(JSON.stringify(result.result))
    } else if (result.result.answer !== null) {
      console.log(result.result.answer)
    }
    if (result.result.timedOut) {
      if (!json) {
        const waitedMs = result.result.timeoutMs ?? timeoutMs
        console.error(`ask timeout after ${waitedMs}ms (thread ${result.result.threadId})`)
      }
      process.exitCode = 1
    }
    if (result.result.cancelled) {
      if (!json) {
        console.error(
          result.result.connectionLost
            ? `ask connection closed (question ${result.result.messageId})`
            : `ask cancelled (question ${result.result.messageId})`
        )
      }
      process.exitCode = 1
    }
  },
  'orchestration dispatch-show': async ({ flags, client, cwd, json }) => {
    const showPreamble = flags.has('preamble') ? true : undefined
    const from = showPreamble
      ? await resolveCoordinatorTerminalHandle(flags, cwd, client)
      : undefined
    const result = await client.call(client.rpc.orchestration.dispatchShow, {
      task: getRequiredStringFlag(flags, 'task'),
      preamble: showPreamble,
      from,
      devMode: isDevCliInvocation()
    })
    printResult(result, json, (value) => {
      if (value.preamble && showPreamble) {
        return value.preamble
      }
      if (!value.dispatch) {
        return 'No dispatch context found.'
      }
      return `${value.dispatch.id} task=${value.dispatch.task_id} [${value.dispatch.status}]`
    })
  },
  'orchestration coordinator-start': async () => {
    throw new RuntimeClientError(
      'orchestration_migration_required',
      'The legacy automatic coordinator command is retired. No effects were applied.',
      orchestrationMigrationData('command_retired')
    )
  },
  'orchestration coordinator-stop': async () => {
    throw new RuntimeClientError(
      'orchestration_migration_required',
      'The legacy automatic coordinator command is retired. No effects were applied.',
      orchestrationMigrationData('command_retired')
    )
  },
  'orchestration gate-create': async ({ flags, client, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.gateCreate,
      {
        task: getRequiredStringFlag(flags, 'task'),
        question: getRequiredStringFlag(flags, 'question'),
        options: getOptionalStringFlag(flags, 'options')
      }
    )
    printResult(
      result,
      json,
      (value) =>
        `Gate ${value.gate.id} created for task ${value.gate.task_id} [${value.gate.status}]`
    )
  },
  'orchestration gate-resolve': async ({ flags, client, json }) => {
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.gateResolve,
      {
        id: getRequiredStringFlag(flags, 'id'),
        resolution: getRequiredStringFlag(flags, 'resolution')
      }
    )
    printResult(result, json, (value) => `Gate ${value.gate.id} resolved: ${value.gate.resolution}`)
  },
  'orchestration gate-list': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.orchestration.gateList, {
      task: getOptionalStringFlag(flags, 'task'),
      status: getOptionalChoiceFlag(flags, 'status', GATE_STATUS_VALUES)
    })
    printResult(result, json, (value) =>
      value.gates.length === 0
        ? 'No gates found.'
        : value.gates
            .map((gate) => `${gate.id} task=${gate.task_id} [${gate.status}] "${gate.question}"`)
            .join('\n')
    )
  },
  'orchestration reset': async ({ flags, client, json }) => {
    const scopeCount = [flags.has('all'), flags.has('tasks'), flags.has('messages')].filter(
      Boolean
    ).length
    if (scopeCount !== 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Choose exactly one reset scope: --all, --tasks, or --messages.'
      )
    }
    const result = await callOrchestrationMutation(client, flags, client.rpc.orchestration.reset, {
      all: flags.has('all') ? true : undefined,
      tasks: flags.has('tasks') ? true : undefined,
      messages: flags.has('messages') ? true : undefined
    })
    printResult(result, json, (value) => `Reset: ${value.reset}`)
  }
}
