import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Why: mirrors files.readLogTail/watchLogTail — the notebook cell's file is an
// absolute host path (the editor already resolved it, same as the desktop IPC
// handler), not a worktree selector, so resolveAuthorizedPath is the gate.
const NOTEBOOK_ACCESS = { scope: 'host', tier: 'host' } as const

export type RuntimeNotebookCellRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}

export const NotebookRunPythonCellInputSchema = z.object({
  filePath: z.string().min(1, 'Missing filePath'),
  code: z.string(),
  preamble: z.string().optional()
})

export type NotebookRunPythonCellInput = z.output<typeof NotebookRunPythonCellInputSchema>

export const notebookContract = {
  runPythonCell: withAccess(NOTEBOOK_ACCESS)
    .input(NotebookRunPythonCellInputSchema)
    .output(type<RuntimeNotebookCellRunResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
