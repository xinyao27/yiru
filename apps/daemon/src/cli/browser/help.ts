import { translate } from '../../i18n/translate'

const BROWSER_COMMAND_USAGE: Readonly<Record<string, string>> = {
  back: 'yiru back [--page <id>] [--worktree <selector>] [--json]',
  'capture start': 'yiru capture start [--page <id>] [--worktree <selector>] [--json]',
  'capture stop': 'yiru capture stop [--page <id>] [--worktree <selector>] [--json]',
  check: 'yiru check --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  clear: 'yiru clear --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  click: 'yiru click --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  'clipboard read': 'yiru clipboard read [--page <id>] [--worktree <selector>] [--json]',
  'clipboard write':
    'yiru clipboard write --text <text> [--page <id>] [--worktree <selector>] [--json]',
  console: 'yiru console [--limit <n>] [--page <id>] [--worktree <selector>] [--json]',
  'cookie delete':
    'yiru cookie delete --name <name> [--url <url>] [--page <id>] [--worktree <selector>] [--json]',
  'cookie get': 'yiru cookie get [--url <url>] [--page <id>] [--worktree <selector>] [--json]',
  'cookie set':
    'yiru cookie set --name <name> --value <value> [--url <url>] [--domain <domain>] [--path <path>] [--secure] [--httpOnly] [--sameSite <value>] [--expires <epoch>] [--page <id>] [--worktree <selector>] [--json]',
  dblclick: 'yiru dblclick --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  'dialog accept':
    'yiru dialog accept [--text <text>] [--page <id>] [--worktree <selector>] [--json]',
  'dialog dismiss': 'yiru dialog dismiss [--page <id>] [--worktree <selector>] [--json]',
  download:
    'yiru download --selector <ref> --path <path> [--page <id>] [--worktree <selector>] [--json]',
  drag: 'yiru drag --from <ref> --to <ref> [--page <id>] [--worktree <selector>] [--json]',
  eval: 'yiru eval --expression <js> [--page <id>] [--worktree <selector>] [--json]',
  exec: 'yiru exec --command <command> [--page <id>] [--worktree <selector>] [--json]',
  fill: 'yiru fill --element <ref> --value <text> [--page <id>] [--worktree <selector>] [--json]',
  find: 'yiru find --locator <type> --value <text> --action <action> [--text <text>] [--page <id>] [--worktree <selector>] [--json]',
  focus: 'yiru focus --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  forward: 'yiru forward [--page <id>] [--worktree <selector>] [--json]',
  'full-screenshot':
    'yiru full-screenshot [--format <png|jpeg>] [--page <id>] [--worktree <selector>] [--json]',
  geolocation:
    'yiru geolocation --latitude <lat> --longitude <lon> [--accuracy <n>] [--page <id>] [--worktree <selector>] [--json]',
  get: 'yiru get --what <property> [--element <ref>] [--page <id>] [--worktree <selector>] [--json]',
  goto: 'yiru goto --url <url> [--page <id>] [--worktree <selector>] [--json]',
  highlight: 'yiru highlight --selector <ref> [--page <id>] [--worktree <selector>] [--json]',
  hover: 'yiru hover --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  inserttext: 'yiru inserttext --text <text> [--page <id>] [--worktree <selector>] [--json]',
  'intercept disable': 'yiru intercept disable [--page <id>] [--worktree <selector>] [--json]',
  'intercept enable':
    'yiru intercept enable [--patterns <glob,...>] [--page <id>] [--worktree <selector>] [--json]',
  'intercept list': 'yiru intercept list [--page <id>] [--worktree <selector>] [--json]',
  is: 'yiru is --what <state> --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  keypress: 'yiru keypress --key <name> [--page <id>] [--worktree <selector>] [--json]',
  'mouse down':
    'yiru mouse down [--button <left|right|middle>] [--page <id>] [--worktree <selector>] [--json]',
  'mouse move': 'yiru mouse move --x <n> --y <n> [--page <id>] [--worktree <selector>] [--json]',
  'mouse up':
    'yiru mouse up [--button <left|right|middle>] [--page <id>] [--worktree <selector>] [--json]',
  'mouse wheel':
    'yiru mouse wheel --dy <n> [--dx <n>] [--page <id>] [--worktree <selector>] [--json]',
  network: 'yiru network [--limit <n>] [--page <id>] [--worktree <selector>] [--json]',
  pdf: 'yiru pdf [--page <id>] [--worktree <selector>] [--json]',
  reload: 'yiru reload [--page <id>] [--worktree <selector>] [--json]',
  screenshot:
    'yiru screenshot [--format <png|jpeg>] [--page <id>] [--worktree <selector>] [--json]',
  scroll:
    'yiru scroll --direction <up|down> [--amount <pixels>] [--page <id>] [--worktree <selector>] [--json]',
  scrollintoview:
    'yiru scrollintoview --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  select:
    'yiru select --element <ref> --value <value> [--page <id>] [--worktree <selector>] [--json]',
  'select-all': 'yiru select-all --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  'set credentials':
    'yiru set credentials --user <user> --pass <pass> [--page <id>] [--worktree <selector>] [--json]',
  'set device': 'yiru set device --name <device> [--page <id>] [--worktree <selector>] [--json]',
  'set headers': 'yiru set headers --headers <json> [--page <id>] [--worktree <selector>] [--json]',
  'set media':
    'yiru set media [--color-scheme <dark|light>] [--reduced-motion <reduce|no-preference>] [--page <id>] [--worktree <selector>] [--json]',
  'set offline':
    'yiru set offline [--state <on|off>] [--page <id>] [--worktree <selector>] [--json]',
  snapshot: 'yiru snapshot [--page <id>] [--worktree <selector>] [--json]',
  'storage local clear': 'yiru storage local clear [--page <id>] [--worktree <selector>] [--json]',
  'storage local get':
    'yiru storage local get --key <key> [--page <id>] [--worktree <selector>] [--json]',
  'storage local set':
    'yiru storage local set --key <key> --value <value> [--page <id>] [--worktree <selector>] [--json]',
  'storage session clear':
    'yiru storage session clear [--page <id>] [--worktree <selector>] [--json]',
  'storage session get':
    'yiru storage session get --key <key> [--page <id>] [--worktree <selector>] [--json]',
  'storage session set':
    'yiru storage session set --key <key> --value <value> [--page <id>] [--worktree <selector>] [--json]',
  'tab close': 'yiru tab close [--index <n>] [--page <id>] [--json]',
  'tab create': 'yiru tab create [--url <url>] [--worktree <selector>] [--profile <id>] [--json]',
  'tab current': 'yiru tab current [--worktree <selector|all>] [--json]',
  'tab list': 'yiru tab list [--worktree <selector|all>] [--show-profile] [--json]',
  'tab profile clone':
    'yiru tab profile clone --profile <id> [--page <id>] [--worktree <selector>] [--json]',
  'tab profile create':
    'yiru tab profile create --label <name> [--scope <isolated|imported>] [--json]',
  'tab profile delete': 'yiru tab profile delete --profile <id> [--json]',
  'tab profile list': 'yiru tab profile list [--json]',
  'tab profile set':
    'yiru tab profile set (--page <id> | --worktree <selector>) --profile <id> [--json]',
  'tab profile show': 'yiru tab profile show --page <id> [--worktree <selector>] [--json]',
  'tab profile use-default':
    'yiru tab profile use-default --page <id> [--worktree <selector>] [--json]',
  'tab show': 'yiru tab show --page <id> [--worktree <selector>] [--json]',
  'tab switch':
    'yiru tab switch (--index <n> | --page <id>) [--worktree <selector>] [--focus] [--json]',
  type: 'yiru type --input <text> [--page <id>] [--worktree <selector>] [--json]',
  uncheck: 'yiru uncheck --element <ref> [--page <id>] [--worktree <selector>] [--json]',
  upload:
    'yiru upload --element <ref> --files <path,...> [--page <id>] [--worktree <selector>] [--json]',
  viewport:
    'yiru viewport --width <w> --height <h> [--scale <n>] [--mobile] [--page <id>] [--worktree <selector>] [--json]',
  wait: 'yiru wait [--selector <sel>] [--timeout <ms>] [--text <text>] [--url <pattern>] [--load <state>] [--fn <js>] [--state <hidden|visible>] [--page <id>] [--worktree <selector>] [--json]'
}

export function printBrowserCliHelp(commandPath?: string): void {
  if (commandPath === 'browser') {
    console.log(
      translate(
        'Usage: yiru browser open --url <url> [--project <id>] [--worktree <id>] [--no-wake] [--json]'
      )
    )
    return
  }
  if (commandPath) {
    const usage = BROWSER_COMMAND_USAGE[commandPath]
    if (!usage) {
      throw new Error(`browser_command_unsupported:${commandPath}`)
    }
    console.log(translate(`Usage: ${usage.slice('yiru '.length)}`))
    return
  }
  const commands = Object.keys(BROWSER_COMMAND_USAGE).sort().join(', ')
  console.log(
    translate(
      'Chrome commands run against the active tab through the Yiru extension.\n\nCommands: {{commands}}\n\nUse `yiru <command> --help` for command flags.',
      { commands }
    )
  )
}

export function hasBrowserCliHelp(commandPath: string): boolean {
  return Object.hasOwn(BROWSER_COMMAND_USAGE, commandPath)
}
