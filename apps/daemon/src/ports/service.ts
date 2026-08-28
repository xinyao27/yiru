import type {
  RuntimeWorkspacePortScanResult,
  WorkspacePortScanInput
} from '@yiru/runtime-protocol/contract'

import type { WorkbenchRuntimeBridge } from '../workbench/runtime'

export class WorkspacePortService {
  private readonly scanWorkbenchPorts: WorkbenchRuntimeBridge['scanWorkspacePorts']

  constructor(workbenchRuntime: WorkbenchRuntimeBridge) {
    this.scanWorkbenchPorts = workbenchRuntime.scanWorkspacePorts
  }

  async scan(input: WorkspacePortScanInput): Promise<RuntimeWorkspacePortScanResult> {
    return this.scanWorkbenchPorts(input.repoId)
  }
}
