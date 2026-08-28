import { translate } from '../../i18n/translate'
import { hasFlag, requireFlag } from '../arguments'
import { connectCliRuntime } from '../runtime/session'
import { parseComputerActionInput, parseComputerObserveInput, parsePermissionId } from './input'
import { writeComputerOutput } from './output'

const ACTIONS = new Set([
  'click',
  'drag',
  'hotkey',
  'paste-text',
  'perform-secondary-action',
  'press-key',
  'scroll',
  'set-value',
  'type-text'
])

export async function runComputerCommand(args: string[]): Promise<void> {
  const [action] = args
  if (action === undefined || action === 'help' || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printComputerHelp()
    return
  }
  const session = await connectCliRuntime(args)
  const json = hasFlag(args, '--json')
  try {
    switch (action) {
      case 'capabilities': {
        const result = await session.client.computer.capabilities({})
        await writeComputerOutput(
          result,
          json,
          `${result.provider} (${result.platform}, ${translate('protocol')} ${result.protocolVersion})`
        )
        return
      }
      case 'list-apps': {
        const result = await session.client.computer.listApps({})
        await writeComputerOutput(
          result,
          json,
          result.apps.map((app) => `${app.name}\tpid:${app.pid}`).join('\n') ||
            translate('No apps found')
        )
        return
      }
      case 'permissions': {
        const id = parsePermissionId(args)
        const result = await session.client.computer.permissions(id ? { id } : {})
        await writeComputerOutput(result, json, formatPermissions(result.permissions))
        return
      }
      case 'permissions-status': {
        const result = await session.client.computer.permissionsStatus({})
        await writeComputerOutput(result, json, formatPermissions(result.permissions))
        return
      }
      case 'permissions-reset': {
        const result = await session.client.computer.permissionsReset({})
        await writeComputerOutput(result, json, formatPermissions(result.permissions))
        return
      }
      case 'list-windows': {
        const result = await session.client.computer.listWindows({
          app: requireFlag(args, '--app')
        })
        await writeComputerOutput(
          result,
          json,
          result.windows.map((window) => `[${window.index}] ${window.title}`).join('\n') ||
            translate('No windows found')
        )
        return
      }
      case 'get-app-state': {
        const result = await session.client.computer.getAppState(parseComputerObserveInput(args))
        await writeComputerOutput(result, json, result.snapshot.treeText)
        return
      }
      case 'click': {
        const result = await session.client.computer.click(
          await parseComputerActionInput('click', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'perform-secondary-action': {
        const result = await session.client.computer.performSecondaryAction(
          await parseComputerActionInput('perform-secondary-action', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'scroll': {
        const result = await session.client.computer.scroll(
          await parseComputerActionInput('scroll', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'drag': {
        const result = await session.client.computer.drag(
          await parseComputerActionInput('drag', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'type-text': {
        const result = await session.client.computer.typeText(
          await parseComputerActionInput('type-text', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'press-key': {
        const result = await session.client.computer.pressKey(
          await parseComputerActionInput('press-key', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'hotkey': {
        const result = await session.client.computer.hotkey(
          await parseComputerActionInput('hotkey', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'paste-text': {
        const result = await session.client.computer.pasteText(
          await parseComputerActionInput('paste-text', args)
        )
        await writeActionOutput(result, json)
        return
      }
      case 'set-value': {
        const result = await session.client.computer.setValue(
          await parseComputerActionInput('set-value', args)
        )
        await writeActionOutput(result, json)
        return
      }
      default:
        throw new Error(`computer_action_unsupported:${action}`)
    }
  } finally {
    session.close()
  }
}

export function printComputerHelp(): void {
  console.log(
    translate(
      'Usage: yiru computer <capabilities|list-apps|permissions|permissions-status|permissions-reset|list-windows|get-app-state|click|perform-secondary-action|scroll|drag|type-text|press-key|hotkey|paste-text|set-value> [options]'
    )
  )
}

function formatPermissions(permissions: { id: string; status: string }[] | undefined): string {
  return (
    permissions?.map((permission) => `${permission.id}=${permission.status}`).join('\n') ||
    translate('Permission status is unavailable')
  )
}

async function writeActionOutput(result: unknown, json: boolean): Promise<void> {
  await writeComputerOutput(result, json, translate('Computer action completed'))
}

export function isComputerAction(action: string): boolean {
  return ACTIONS.has(action)
}
