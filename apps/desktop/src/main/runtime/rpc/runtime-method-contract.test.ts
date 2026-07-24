import { describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'

import { defineRuntimeMethodContract } from '../../../shared/runtime-method-contract'
import type { YiruRuntimeService } from '../yiru-runtime'
import { defineMethod } from './core'
import { RpcDispatcher } from './dispatcher'

const EchoContract = defineRuntimeMethodContract<{ echoed: string }>()({
  name: 'test.echo',
  params: z.object({ message: z.string().min(1, 'Missing message') }),
  mobile: true
})

const DesktopOnlyContract = defineRuntimeMethodContract<null>()({
  name: 'test.desktopOnly',
  params: null,
  mobile: false
})

function createRuntime(): YiruRuntimeService {
  return {
    getRuntimeId: () => 'runtime-test',
    fileCommands: {},
    gitCommands: {},
    browserCommands: {},
    emulatorCommands: {},
    mobileNotifications: {}
  } as unknown as YiruRuntimeService
}

describe('runtime method contracts', () => {
  it('drives validation, dispatch, and mobile authorization from one contract', async () => {
    const dispatcher = new RpcDispatcher({
      runtime: createRuntime(),
      methods: [
        defineMethod({
          contract: EchoContract,
          handler: ({ message }) => ({ echoed: message })
        }),
        defineMethod({
          contract: DesktopOnlyContract,
          handler: () => null
        })
      ]
    })

    expect(dispatcher.isAvailableToMobile(EchoContract.name)).toBe(true)
    expect(dispatcher.isAvailableToMobile(DesktopOnlyContract.name)).toBe(false)

    const invalid = await dispatcher.dispatch({
      id: 'invalid',
      authToken: 'test',
      method: EchoContract.name,
      params: { message: '' }
    })
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })

    const valid = await dispatcher.dispatch({
      id: 'valid',
      authToken: 'test',
      method: EchoContract.name,
      params: { message: 'hello' }
    })
    expect(valid).toMatchObject({ ok: true, result: { echoed: 'hello' } })
  })
})
