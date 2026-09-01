// Canonical ignore list for recursive worktree watchers (mirrors VS Code's
// predefined recursive-watch excludes).
export const WATCHER_IGNORE_DIRS: string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'target',
  '.venv',
  '__pycache__'
]
