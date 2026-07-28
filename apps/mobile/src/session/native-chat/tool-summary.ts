import { isToolCallBlock, toolFilePath, type NativeChatBlock } from '@yiru/workbench-model/agent'

const EDIT_TOOL_NAMES = new Set([
  'applypatch',
  'create',
  'edit',
  'editfile',
  'multiedit',
  'multireplacefilecontent',
  'notebookedit',
  'patch',
  'replace',
  'replacefilecontent',
  'searchreplace',
  'write',
  'writefile',
  'writetofile'
])
const EXPLORE_TOOL_NAMES = new Set([
  'findbyname',
  'glob',
  'listdir',
  'read',
  'readfile',
  'readmanyfiles',
  'view',
  'viewfile'
])
const SEARCH_TOOL_NAMES = new Set([
  'googlewebsearch',
  'grep',
  'grepsearch',
  'searchfilecontent',
  'searchfiles',
  'searchweb',
  'sessionsearch',
  'websearch'
])
const COMMAND_TOOL_NAMES = new Set([
  'bash',
  'execute',
  'executecode',
  'execcommand',
  'powershell',
  'runcommand',
  'runshellcommand',
  'runterminalcmd',
  'runterminalcommand',
  'shellcommand',
  'terminal'
])

function normalizedToolName(name: string): string {
  const leafName =
    name
      .trim()
      .split(/(?:__|[.:/])/)
      .at(-1) ?? name
  return leafName.replaceAll(/[^a-z0-9]/gi, '').toLowerCase()
}

function fileCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`
}

export function summarizeMobileToolRun(blocks: readonly NativeChatBlock[]): string {
  const editedFiles = new Set<string>()
  const exploredFiles = new Set<string>()
  let searchCount = 0
  let commandCount = 0
  let otherCount = 0
  let callIndex = 0

  for (const block of blocks) {
    if (!isToolCallBlock(block)) {
      continue
    }
    const name = normalizedToolName(block.name)
    const target = toolFilePath(block.input) ?? `call:${callIndex}`
    callIndex += 1
    if (EDIT_TOOL_NAMES.has(name)) {
      editedFiles.add(target)
    } else if (EXPLORE_TOOL_NAMES.has(name)) {
      exploredFiles.add(target)
    } else if (SEARCH_TOOL_NAMES.has(name)) {
      searchCount += 1
    } else if (COMMAND_TOOL_NAMES.has(name)) {
      commandCount += 1
    } else {
      otherCount += 1
    }
  }

  const parts: string[] = []
  if (editedFiles.size > 0) {
    parts.push(`Edited ${fileCountLabel(editedFiles.size)}`)
  }
  if (exploredFiles.size > 0) {
    const action = parts.length === 0 ? 'Explored' : 'explored'
    parts.push(`${action} ${fileCountLabel(exploredFiles.size)}`)
  }
  if (searchCount > 0) {
    parts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`)
  }
  if (commandCount > 0) {
    const action = parts.length === 0 ? 'Ran' : 'ran'
    parts.push(`${action} ${commandCount} ${commandCount === 1 ? 'command' : 'commands'}`)
  }
  if (otherCount > 0) {
    parts.push(`${otherCount} other ${otherCount === 1 ? 'tool' : 'tools'}`)
  }
  return parts.join(', ') || 'Tool activity'
}

export {
  briefToolArg,
  countToolCalls,
  formatToolInput,
  summarizeToolInput,
  summarizeToolRun,
  toolFilePath
} from '@yiru/workbench-model/agent'
