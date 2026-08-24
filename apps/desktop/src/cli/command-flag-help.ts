export function formatCommandFlagHelp(flag: string, commandPath: string[]): string {
  const command = commandPath.join(' ')
  if (command === 'worktree create' && flag === 'parent-worktree') {
    return '--parent-worktree <selector> Parent selector such as active/current, id:<repo-id>::<path>, branch:<branch>, path:<path>, folder:<id>, or worktree:<worktreeId>'
  }
  if (command === 'orchestration task-create' && flag === 'task-title') {
    return '--task-title <text>  Concise title for the orchestration task'
  }
  if (command === 'orchestration task-create' && flag === 'display-name') {
    return '--display-name <text> UI label shown for dispatched worker rows'
  }
  if (command === 'orchestration worker-read' && flag === 'cursor') {
    return '--cursor <cursor>      Opaque cursor returned by a previous worker-read page'
  }
  if (flag === 'key' && command === 'computer hotkey') {
    return '--key <key-combo>      Modifier chord with one key, e.g. CmdOrCtrl+A'
  }
  if (flag === 'key' && command === 'computer press-key') {
    return '--key <key>            Single key, e.g. Return, Escape, Tab, Left, or PageUp'
  }
  return formatFlagHelp(flag)
}

export function formatFlagHelp(flag: string): string {
  const helpByFlag: Record<string, string> = {
    agent: '--agent <id>          Launch a known TUI agent in the first terminal',
    'base-branch': '--base-branch <ref>    Base branch/ref to create the worktree from',
    command: '--command <text>       Command to run in the terminal on startup',
    comment: '--comment <text>       Comment stored in Yiru metadata',
    cursor: '--cursor <n>           Line cursor from a previous read (returns only new output)',
    action: '--action <name>       Secondary accessibility action name',
    activate: '--activate             Reveal the new worktree in the Yiru app',
    app: '--app <app>            App name, bundle ID, or pid:N',
    direction:
      '--direction <dir>      Direction: up|down|left|right for scroll, horizontal|vertical for split',
    'display-name': '--display-name <name>  Override the Yiru display name',
    'element-index': '--element-index <n>   Element index from get-app-state',
    title: '--title <text>         Custom title for the terminal tab (omit to reset)',
    enter: '--enter                Append Enter after sending text',
    force: '--force                Force worktree removal when supported',
    focus: '--focus                Reveal the created terminal session in Yiru',
    for: '--for exit|tui-idle    Wait condition to satisfy',
    'from-element-index': '--from-element-index <n> Source element index from get-app-state',
    'from-x': '--from-x <x>           Source window-local x coordinate',
    'from-y': '--from-y <y>           Source window-local y coordinate',
    help: '--help                 Show this help message',
    interrupt: '--interrupt            Send as an interrupt-style input when supported',
    id: '--id <id>             Identifier for a target item or permission',
    json: '--json                 Emit machine-readable JSON',
    key: '--key <key>            Key argument for this command',
    limit: '--limit <n>            Maximum number of rows to return',
    mode: '--mode <mode>          Mode such as edit, diff, or both',
    'mouse-button': '--mouse-button <btn>   Mouse button: left, right, or middle',
    name: '--name <name>          Name for the new worktree',
    'no-parent': '--no-parent            Force no parent lineage for unrelated work',
    'no-screenshot': '--no-screenshot       Skip screenshot capture after the operation',
    pages: '--pages <n>           Number of scroll pages',
    'parent-worktree':
      '--parent-worktree <selector> Parent worktree selector such as id:<repo-id>::<path>, branch:<branch>, path:<path>, or active/current',
    path: '--path <path>          Path argument for the command',
    prompt: '--prompt <text>        Prompt text for agent-backed commands',
    query: '--query <text>        Search text for matching refs',
    ref: '--ref <ref>            Base ref to persist for the repo',
    repo: '--repo <selector>      Repo selector such as id:<id>, name:<name>, or path:<path>',
    'restore-window':
      '--restore-window     Bring the target app/window forward before the operation',
    session: '--session <id>        Snapshot namespace for a related computer-use workflow',
    setup: '--setup run|skip|inherit Setup policy for repo-defined setup hooks',
    terminal: '--terminal <handle>  Runtime-issued terminal handle',
    text: '--text <text>          Text payload to send or type',
    'text-stdin': '--text-stdin          Read text payload from stdin',
    'task-id': '--task-id <id>        Task id to include in orchestration payload JSON',
    'task-title': '--task-title <text>    Concise title for an orchestration task',
    'dispatch-id': '--dispatch-id <id>    Dispatch id to include in orchestration payload JSON',
    'files-modified': '--files-modified <csv> Comma-separated files for orchestration payload JSON',
    'report-path': '--report-path <path>  Report path to include in orchestration payload JSON',
    phase: '--phase <text>        Worker phase to include in orchestration payload JSON',
    'timeout-ms': '--timeout-ms <ms>     Maximum wait time before timing out',
    'to-element-index': '--to-element-index <n> Destination element index from get-app-state',
    'to-x': '--to-x <x>             Destination window-local x coordinate',
    'to-y': '--to-y <y>             Destination window-local y coordinate',
    worktree:
      '--worktree <selector>  Worktree selector such as id:<repo-id>::<path>, name:<displayName>, branch:<branch>, path:<path>, or active/current',
    'workspace-status':
      '--workspace-status <id> Workspace status id (defaults: todo, in-progress, in-review, completed)',
    staged: '--staged               Open staged source-control changes',
    provider: '--provider <agent>     Agent id such as codex, claude, or gemini',
    'value-stdin': '--value-stdin         Read set-value payload from stdin',
    'window-id': '--window-id <id>      Target a window id from list-windows',
    'window-index': '--window-index <n>   Target a window index from list-windows',
    element: '--element <ref>        Element ref from snapshot (e.g. e3)',
    url: '--url <url>            URL to navigate to',
    value: '--value <text>         Value to fill or select',
    input: '--input <text>         Text to type at current focus',
    expression: '--expression <js>     JavaScript expression to evaluate',
    amount: '--amount <pixels>      Scroll distance in pixels',
    index: '--index <n>            Tab index to switch to',
    page: '--page <id>            Stable browser page id from `yiru tab list --json`',
    profile: '--profile <id>        Browser profile id',
    'show-profile': '--show-profile        Include tab profile in text output',
    format: '--format <png|jpeg>    Screenshot image format'
  }
  return helpByFlag[flag] ?? `--${flag}`
}
