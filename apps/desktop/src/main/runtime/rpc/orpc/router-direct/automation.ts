import {
  handleAutomationCreate,
  handleAutomationDelete,
  handleAutomationList,
  handleAutomationRunNow,
  handleAutomationRuns,
  handleAutomationShow,
  handleAutomationSnapshotWorkspaceName,
  handleAutomationUpdate
} from '~main/runtime/rpc/methods/automations'
import {
  handleAutomationCreateExternal,
  handleAutomationListExternalManagers,
  handleAutomationListExternalRuns,
  handleAutomationRunExternalAction,
  handleAutomationUpdateExternal
} from '~main/runtime/rpc/methods/automations-external'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: scheduled/triggered agent runs, plus the external (Hermes/OpenClaw)
// cron managers they can delegate to — one feature area, one file.
export const automationRuntimeHandlers = {
  automation: {
    list: runtimeImplementation.automation.list.handler(
      wireRuntimeMethod('automation.list', handleAutomationList)
    ),
    show: runtimeImplementation.automation.show.handler(
      wireRuntimeMethod('automation.show', handleAutomationShow)
    ),
    create: runtimeImplementation.automation.create.handler(
      wireRuntimeMethod('automation.create', handleAutomationCreate)
    ),
    update: runtimeImplementation.automation.update.handler(
      wireRuntimeMethod('automation.update', handleAutomationUpdate)
    ),
    delete: runtimeImplementation.automation.delete.handler(
      wireRuntimeMethod('automation.delete', handleAutomationDelete)
    ),
    runNow: runtimeImplementation.automation.runNow.handler(
      wireRuntimeMethod('automation.runNow', handleAutomationRunNow)
    ),
    runs: runtimeImplementation.automation.runs.handler(
      wireRuntimeMethod('automation.runs', handleAutomationRuns)
    ),
    listExternalManagers: runtimeImplementation.automation.listExternalManagers.handler(
      wireRuntimeMethod('automation.listExternalManagers', handleAutomationListExternalManagers)
    ),
    listExternalRuns: runtimeImplementation.automation.listExternalRuns.handler(
      wireRuntimeMethod('automation.listExternalRuns', handleAutomationListExternalRuns)
    ),
    createExternal: runtimeImplementation.automation.createExternal.handler(
      wireRuntimeMethod('automation.createExternal', handleAutomationCreateExternal)
    ),
    updateExternal: runtimeImplementation.automation.updateExternal.handler(
      wireRuntimeMethod('automation.updateExternal', handleAutomationUpdateExternal)
    ),
    runExternalAction: runtimeImplementation.automation.runExternalAction.handler(
      wireRuntimeMethod('automation.runExternalAction', handleAutomationRunExternalAction)
    ),
    snapshotWorkspaceName: runtimeImplementation.automation.snapshotWorkspaceName.handler(
      wireRuntimeMethod('automation.snapshotWorkspaceName', handleAutomationSnapshotWorkspaceName)
    )
  }
} as const
