import type { CommandSpec } from './args'
import { findCommandSpec, isCommandGroup, supportsBrowserPageFlag } from './args'
import { formatCommandFlagHelp } from './command-flag-help'
import { unknownCommandData } from './command-suggestion'
import { ROOT_HELP_REFERENCE } from './root-help-reference'

export { formatFlagHelp } from './command-flag-help'

const ROOT_HELP_TEXT = `yiru

Usage: yiru <command> [options]

Startup:
  open [directory]          Open Yiru or open a directory as a workspace
  connect                   Connect this computer to the Yiru Web app
  serve                     Start a headless Yiru runtime host
  status                    Show app/runtime/graph readiness

Diagnostics:
  diagnostics memory        Collect a memory snapshot for Yiru and managed terminals

Agent Discovery:
  agent-context             Print the machine-readable command schema for agents

Skills:
  skills list               List version-matched skill guides bundled with this Yiru CLI
  skills get                Print a version-matched skill guide as Markdown

Projects:
  project list              List durable projects known to Yiru
  project setups            List project host setups
  project setup-existing-folder Make a project available on a host by importing an existing folder
  project setup-clone       Make a project available on a host by cloning a repository
  project setup-create      Create independent project host setup metadata
  project setup-update      Update project host setup metadata
  project setup-delete      Remove a project host setup

Repos:
  repo list                 List repos registered in Yiru
  repo add                  Add a project to Yiru by filesystem path
  repo show                 Show one registered repo
  repo set-base-ref         Set the repo's default base ref for future worktrees
  repo search-refs          Search branch/tag refs within a repo

Worktrees:
  worktree list             List Yiru-managed worktrees
  worktree show             Show one worktree
  worktree current          Show the Yiru-managed worktree for the current directory
  worktree create           Create a new Yiru-managed worktree
  worktree set              Update Yiru metadata for a worktree
  worktree rm               Remove a worktree from Yiru and git
  worktree ps               Show a compact orchestration summary across worktrees

Files:
  file open                 Open a workspace file in the Yiru editor
  file diff                 Open a workspace file diff in the Yiru editor
  file open-changed         Open all git-changed files for a workspace

Terminals:
  terminal list             List live Yiru-managed terminals
  terminal show             Show terminal metadata and preview
  terminal read             Read bounded terminal output
  terminal send             Send input to a live terminal
  terminal wait             Wait for a terminal condition (exit, tui-idle)
  terminal stop             Stop terminals for a worktree
  terminal create           Create a terminal session in a worktree
  terminal rename           Set or clear the title of a terminal tab
  terminal split            Split an existing terminal pane
  terminal switch           Bring a terminal tab to the foreground
  terminal focus            Alias for terminal switch
  terminal close            Close a terminal pane (or tab if last pane)

Orchestration:
  orchestration run-create  Create and bind a lightweight orchestration Run
  orchestration run-use     Bind this coordinator terminal to an existing Run
  orchestration run-current Show this terminal's bound Run
  orchestration run-list    List lightweight orchestration Runs
  orchestration run-show    Show one lightweight orchestration Run
  orchestration send        Send an inter-agent message
  orchestration check       Check the bound Run mailbox
  orchestration ask         Ask the coordinator a blocking question
  orchestration reply       Reply to a message
  orchestration inbox       Show all messages across recipients
  orchestration task-create Create an orchestration task
  orchestration task-list   List orchestration tasks
  orchestration task-update Update a task status
  orchestration dispatch    Dispatch a task to a terminal
  orchestration dispatch-show Show dispatch context for a task
  orchestration worker-start Start a supervised worker locally or through a connected Coworking host
  orchestration worker-show Inspect one supervised worker
  orchestration worker-read Read bounded output from one supervised worker
  orchestration worker-stop Stop one supervised worker
  orchestration worker-abandon Fence an uncertain worker without claiming it stopped
  orchestration coordinator-start Start the retired automatic coordinator loop
  orchestration coordinator-stop Stop the retired automatic coordinator loop
  orchestration gate-create Create a decision gate blocking a task
  orchestration gate-resolve Resolve a pending decision gate
  orchestration gate-list   List decision gates
  orchestration reset       Reset orchestration state

Computer Use:
  computer capabilities     Show computer-use provider capabilities
  computer permissions      Show or open computer-use permission setup
  computer list-apps        List running apps available to computer-use
  computer list-windows     List visible windows for a target app
  computer get-app-state    Capture a compact accessibility snapshot of an app
  computer click            Click an app element or window coordinate
  computer perform-secondary-action Run an advertised accessibility action
  computer scroll           Scroll an app element
  computer drag             Drag between app elements or window coordinates
  computer type-text        Type literal text at the current app focus
  computer press-key        Press a single key such as Return or Escape
  computer hotkey           Press a shortcut combination such as CmdOrCtrl+A
  computer paste-text       Paste text through the native clipboard path
  computer set-value        Set the value of a settable app element

Mobile Emulator (iOS Simulator):
  emulator list             List available/running emulators (Yiru-managed + raw serve-sim)
  emulator attach <device>  Attach/start helper and make active for the worktree
  emulator tap <x> <y>      Tap at normalized 0..1 coords (preferred for single taps)
  emulator type <text>      Type text (US ASCII only)
  emulator gesture <json>   Send begin/move/end touch points
  emulator button <name>    Hardware button (home, side_button, etc.)
  emulator rotate <o>       Rotate device (portrait|landscape_left|...)
  emulator exec --command   Raw serve-sim subcommand passthrough (no "serve-sim" prefix)
  emulator kill             Stop helper for device

Browser Automation:
  tab create                Create a new browser tab (navigates to --url)
  tab list                  List open browser tabs
  tab show                  Show one browser tab by page id
  tab current               Show the current browser tab
  tab profile list          List browser session profiles
  tab profile create        Create a browser session profile
  tab profile delete        Delete a browser session profile
  tab profile set           Switch a browser tab to a different profile
  tab profile show          Show the profile bound to a browser tab
  tab profile use-default   Switch a browser tab back to the default profile
  tab profile clone         Clone a browser tab into another profile
  tab switch                Switch the active browser tab by --index or --page
  tab close                 Close a browser tab by --index/--page or the current tab
  snapshot                  Accessibility snapshot with element refs (e.g. @e1, @e2)
  goto                      Navigate the active tab to --url
  click                     Click element by --element ref
  fill                      Clear and fill input by --element ref with --value
  type                      Type --input text at the current focus (no element needed)
  select                    Select dropdown option by --element ref and --value
  hover                     Hover element by --element ref
  keypress                  Press a key (e.g. --key Enter, --key Tab)
  scroll                    Scroll --direction (up/down) by --amount pixels
  back                      Navigate back in browser history
  reload                    Reload the active browser tab
  screenshot                Capture viewport screenshot (--format png|jpeg)
  eval                      Evaluate --expression JavaScript in the page context
  wait                      Wait for page idle or --timeout ms
  check                     Check a checkbox by --element ref
  uncheck                   Uncheck a checkbox by --element ref
  focus                     Focus an element by --element ref
  clear                     Clear an input by --element ref
  drag                      Drag --from ref to --to ref
  upload                    Upload --files to a file input by --element ref
  dblclick                  Double-click element by --element ref
  forward                   Navigate forward in browser history
  scrollintoview            Scroll --element into view
  get                       Get element property (--what: text, html, value, url, title)
  is                        Check element state (--what: visible, enabled, checked)
  inserttext                Insert text without key events
  mouse move                Move mouse to --x --y coordinates
  mouse down                Press mouse button
  mouse up                  Release mouse button
  mouse wheel               Scroll wheel --dy [--dx]
  find                      Find element by locator (--locator role|text|label --value <v>)
  set device                Emulate device (--name "iPhone 12")
  set offline               Toggle offline mode (--state on|off)
  set headers               Set HTTP headers (--headers '{"key":"val"}')
  set credentials           Set HTTP auth (--user <u> --pass <p>)
  set media                 Set color scheme (--color-scheme dark|light)
  clipboard read            Read clipboard contents
  clipboard write           Write --text to clipboard
  dialog accept             Accept browser dialog (--text for prompt response)
  dialog dismiss            Dismiss browser dialog
  storage local get         Get localStorage value by --key
  storage local set         Set localStorage --key --value
  storage local clear       Clear localStorage
  storage session get       Get sessionStorage value by --key
  storage session set       Set sessionStorage --key --value
  storage session clear     Clear sessionStorage
  download                  Download file via --selector to --path
  highlight                 Highlight --selector on page
  exec                      Run any agent-browser command (--command "...")

${ROOT_HELP_REFERENCE}`

export function printHelp(specs: CommandSpec[], commandPath: string[] = []): void {
  const exactSpec = findCommandSpec(specs, commandPath)
  if (exactSpec) {
    console.log(formatCommandHelp(exactSpec))
    return
  }

  if (isCommandGroup(commandPath)) {
    console.log(formatGroupHelp(specs, commandPath[0]))
    return
  }

  if (commandPath.length > 0) {
    const { nextSteps } = unknownCommandData(specs, commandPath)
    const recovery = nextSteps.map((step) => `Next step: ${step}`).join('\n')
    console.log(`Unknown command: ${commandPath.join(' ')}${recovery ? `\n${recovery}` : ''}\n`)
  }

  console.log(ROOT_HELP_TEXT)
}

export function formatCommandHelp(spec: CommandSpec): string {
  const lines = [`yiru ${spec.path.join(' ')}`, '', `Usage: ${spec.usage}`, '', spec.summary]
  const displayedFlags =
    spec.argumentMode === 'passthrough'
      ? []
      : supportsBrowserPageFlag(spec.path)
        ? [...spec.allowedFlags, 'page']
        : spec.allowedFlags

  if (displayedFlags.length > 0) {
    lines.push('', 'Options:')
    for (const flag of displayedFlags) {
      lines.push(`  ${formatCommandFlagHelp(flag, spec.path)}`)
    }
  }

  if (spec.notes && spec.notes.length > 0) {
    lines.push('', 'Notes:')
    for (const note of spec.notes) {
      lines.push(`  ${note}`)
    }
  }

  if (spec.examples && spec.examples.length > 0) {
    lines.push('', 'Examples:')
    for (const example of spec.examples) {
      lines.push(`  $ ${example}`)
    }
  }

  return lines.join('\n')
}

export function formatGroupHelp(specs: CommandSpec[], group: string): string {
  const groupSpecs = specs.filter((spec) => spec.path[0] === group && spec.path.length > 1)
  const lines = [`yiru ${group}`, '', `Usage: yiru ${group} <command> [options]`, '', 'Commands:']
  for (const spec of groupSpecs) {
    lines.push(`  ${spec.path.slice(1).join(' ').padEnd(18)} ${spec.summary}`)
  }
  lines.push('', `Run \`yiru ${group} <command> --help\` for command-specific usage.`)
  return lines.join('\n')
}
