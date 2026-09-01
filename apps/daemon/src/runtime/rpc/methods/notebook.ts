import { dirname } from 'node:path'

import type { NotebookRunPythonCellInput } from '@yiru/runtime-protocol/contract'
import { resolveAuthorizedNotebookFilePath, runPythonCell } from '~main/notebook'

export async function handleNotebookRunPythonCell(params: NotebookRunPythonCellInput) {
  const filePath = await resolveAuthorizedNotebookFilePath(params.filePath)
  return runPythonCell(params.code, params.preamble ?? '', dirname(filePath))
}
