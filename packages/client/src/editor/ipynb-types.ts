export type IpynbCellKind = 'code' | 'markdown' | 'raw'

export type IpynbOutput =
  | { kind: 'stream'; name: string; text: string }
  | { kind: 'error'; name: string; message: string; traceback: string }
  | { kind: 'display'; outputType: string; executionCount: number | null; items: IpynbOutputItem[] }

export type IpynbOutputItem = {
  mime: string
  value: unknown
}

export type IpynbCell = {
  id: string | null
  kind: IpynbCellKind
  language: string
  source: string
  executionCount: number | null
  outputs: IpynbOutput[]
}

export type ParsedIpynb = {
  language: string
  kernelName: string | null
  nbformat: string
  cells: IpynbCell[]
}

export type IpynbRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error?: string
}
