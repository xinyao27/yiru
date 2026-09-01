import {
  handleFolderWorkspaceCreate,
  handleFolderWorkspaceDelete,
  handleFolderWorkspaceGetPathStatus,
  handleFolderWorkspaceList,
  handleFolderWorkspaceUpdate
} from '~main/runtime/rpc/methods/folder-workspace'
import {
  handleProjectGroupCancelNestedScan,
  handleProjectGroupCreate,
  handleProjectGroupDelete,
  handleProjectGroupImportNested,
  handleProjectGroupList,
  handleProjectGroupMoveProject,
  handleProjectGroupScanNested,
  handleProjectGroupUpdate
} from '~main/runtime/rpc/methods/project-group'
import { handleProjectGroupEventsSubscribe } from '~main/runtime/rpc/methods/project-group-events'
import {
  handleProjectHostSetupClone,
  handleProjectHostSetupCreate,
  handleProjectHostSetupDelete,
  handleProjectHostSetupExistingFolder,
  handleProjectHostSetupList,
  handleProjectHostSetupUpdate,
  handleProjectList,
  handleProjectUpdate
} from '~main/runtime/rpc/methods/project-runtime-rpc-methods'
import { openRuntimeWorkspacePath } from '~main/runtime/rpc/methods/workspace'
import {
  handleWorkspaceCleanupClearDismissals,
  handleWorkspaceCleanupDismiss,
  handleWorkspaceCleanupScan
} from '~main/runtime/rpc/methods/workspace-cleanup'
import { handleWorkspaceCleanupEventsSubscribe } from '~main/runtime/rpc/methods/workspace-cleanup-events'
import { subscribeRuntimeWorkspacePortEvents } from '~main/runtime/rpc/methods/workspace-port-events'
import {
  killRuntimeWorkspacePort,
  scanRuntimeWorkspacePorts
} from '~main/runtime/rpc/methods/workspace-ports'
import {
  handleWorkspaceSpaceAnalyze,
  handleWorkspaceSpaceCancel
} from '~main/runtime/rpc/methods/workspace-space'
import { handleWorkspaceSpaceEventsSubscribe } from '~main/runtime/rpc/methods/workspace-space-events'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: folderWorkspace, project, projectGroup, projectHostSetup,
// workspaceCleanup, workspacePorts, workspaceSpace, and the top-level
// `workspace.openPath` all manage the workspace/project surfaces a repo is
// organized into, as opposed to the git-backed source control underneath one
// (that lives in source-control.ts) or a live agent session
// (agent-session.ts).
export const workspaceRuntimeHandlers = {
  project: {
    list: runtimeImplementation.project.list.handler(
      wireRuntimeMethod('project.list', handleProjectList)
    ),
    update: runtimeImplementation.project.update.handler(
      wireRuntimeMethod('project.update', handleProjectUpdate)
    )
  },
  workspace: {
    openPath: runtimeImplementation.workspace.openPath.handler(
      wireRuntimeMethod('workspace.openPath', openRuntimeWorkspacePath)
    )
  },
  folderWorkspace: {
    list: runtimeImplementation.folderWorkspace.list.handler(
      wireRuntimeMethod('folderWorkspace.list', handleFolderWorkspaceList)
    ),
    create: runtimeImplementation.folderWorkspace.create.handler(
      wireRuntimeMethod('folderWorkspace.create', handleFolderWorkspaceCreate)
    ),
    update: runtimeImplementation.folderWorkspace.update.handler(
      wireRuntimeMethod('folderWorkspace.update', handleFolderWorkspaceUpdate)
    ),
    delete: runtimeImplementation.folderWorkspace.delete.handler(
      wireRuntimeMethod('folderWorkspace.delete', handleFolderWorkspaceDelete)
    ),
    getPathStatus: runtimeImplementation.folderWorkspace.getPathStatus.handler(
      wireRuntimeMethod('folderWorkspace.getPathStatus', handleFolderWorkspaceGetPathStatus)
    )
  },
  projectGroup: {
    list: runtimeImplementation.projectGroup.list.handler(
      wireRuntimeMethod('projectGroup.list', handleProjectGroupList)
    ),
    create: runtimeImplementation.projectGroup.create.handler(
      wireRuntimeMethod('projectGroup.create', handleProjectGroupCreate)
    ),
    update: runtimeImplementation.projectGroup.update.handler(
      wireRuntimeMethod('projectGroup.update', handleProjectGroupUpdate)
    ),
    delete: runtimeImplementation.projectGroup.delete.handler(
      wireRuntimeMethod('projectGroup.delete', handleProjectGroupDelete)
    ),
    moveProject: runtimeImplementation.projectGroup.moveProject.handler(
      wireRuntimeMethod('projectGroup.moveProject', handleProjectGroupMoveProject)
    ),
    scanNested: runtimeImplementation.projectGroup.scanNested.handler(
      wireRuntimeMethod('projectGroup.scanNested', handleProjectGroupScanNested)
    ),
    cancelNestedScan: runtimeImplementation.projectGroup.cancelNestedScan.handler(
      wireRuntimeMethod('projectGroup.cancelNestedScan', handleProjectGroupCancelNestedScan)
    ),
    importNested: runtimeImplementation.projectGroup.importNested.handler(
      wireRuntimeMethod('projectGroup.importNested', handleProjectGroupImportNested)
    ),
    events: {
      subscribe: runtimeImplementation.projectGroup.events.subscribe.handler(
        wireRuntimeStream('projectGroup.events.subscribe', handleProjectGroupEventsSubscribe)
      )
    }
  },
  projectHostSetup: {
    list: runtimeImplementation.projectHostSetup.list.handler(
      wireRuntimeMethod('projectHostSetup.list', handleProjectHostSetupList)
    ),
    create: runtimeImplementation.projectHostSetup.create.handler(
      wireRuntimeMethod('projectHostSetup.create', handleProjectHostSetupCreate)
    ),
    setupExistingFolder: runtimeImplementation.projectHostSetup.setupExistingFolder.handler(
      wireRuntimeMethod(
        'projectHostSetup.setupExistingFolder',
        handleProjectHostSetupExistingFolder
      )
    ),
    clone: runtimeImplementation.projectHostSetup.clone.handler(
      wireRuntimeMethod('projectHostSetup.clone', handleProjectHostSetupClone)
    ),
    update: runtimeImplementation.projectHostSetup.update.handler(
      wireRuntimeMethod('projectHostSetup.update', handleProjectHostSetupUpdate)
    ),
    delete: runtimeImplementation.projectHostSetup.delete.handler(
      wireRuntimeMethod('projectHostSetup.delete', handleProjectHostSetupDelete)
    )
  },
  workspaceCleanup: {
    scan: runtimeImplementation.workspaceCleanup.scan.handler(
      wireRuntimeMethod('workspaceCleanup.scan', handleWorkspaceCleanupScan)
    ),
    dismiss: runtimeImplementation.workspaceCleanup.dismiss.handler(
      wireRuntimeMethod('workspaceCleanup.dismiss', handleWorkspaceCleanupDismiss)
    ),
    clearDismissals: runtimeImplementation.workspaceCleanup.clearDismissals.handler(
      wireRuntimeMethod('workspaceCleanup.clearDismissals', handleWorkspaceCleanupClearDismissals)
    ),
    events: {
      subscribe: runtimeImplementation.workspaceCleanup.events.subscribe.handler(
        wireRuntimeStream(
          'workspaceCleanup.events.subscribe',
          handleWorkspaceCleanupEventsSubscribe
        )
      )
    }
  },
  workspacePorts: {
    scan: runtimeImplementation.workspacePorts.scan.handler(
      wireRuntimeMethod('workspacePorts.scan', scanRuntimeWorkspacePorts)
    ),
    kill: runtimeImplementation.workspacePorts.kill.handler(
      wireRuntimeMethod('workspacePorts.kill', killRuntimeWorkspacePort)
    ),
    events: {
      subscribe: runtimeImplementation.workspacePorts.events.subscribe.handler(
        wireRuntimeStream('workspacePorts.events.subscribe', subscribeRuntimeWorkspacePortEvents)
      )
    }
  },
  workspaceSpace: {
    analyze: runtimeImplementation.workspaceSpace.analyze.handler(
      wireRuntimeMethod('workspaceSpace.analyze', handleWorkspaceSpaceAnalyze)
    ),
    cancel: runtimeImplementation.workspaceSpace.cancel.handler(
      wireRuntimeMethod('workspaceSpace.cancel', handleWorkspaceSpaceCancel)
    ),
    events: {
      subscribe: runtimeImplementation.workspaceSpace.events.subscribe.handler(
        wireRuntimeStream('workspaceSpace.events.subscribe', handleWorkspaceSpaceEventsSubscribe)
      )
    }
  }
} as const
