import { randomUUID } from 'node:crypto'

import { RPCHandler } from '@orpc/server/message-port'
import { BrowserWindow, ipcMain } from 'electron'
import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import {
  parseRuntimeOrpcConnectPortRequest,
  RUNTIME_ORPC_CONNECT_PORT_CHANNEL
} from '~shared/runtime-orpc-message-port'

import { authenticatedTokenFingerprint } from '../orchestration-mutation-executor'
import { createRuntimeOrpcContext } from './bridge'
import { connectRuntimeEnvironmentOrpcMessagePort } from './environment-message-port'
import { createRuntimeOrpcHandlerOptions } from './request-metadata'
import { runtimeOrpcRouter } from './router'
import { electronShellServicesConnectionId } from './shell-services-identity'
import { connectShellServicesReverseLink } from './shell-services-message-port'

export function registerRuntimeOrpcMessagePortHandler(runtime: YiruRuntimeService): void {
  const handler = new RPCHandler(runtimeOrpcRouter, createRuntimeOrpcHandlerOptions())
  ipcMain.removeAllListeners(RUNTIME_ORPC_CONNECT_PORT_CHANNEL)
  ipcMain.on(RUNTIME_ORPC_CONNECT_PORT_CHANNEL, (event, value: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const isMainFrame = event.senderFrame === event.sender.mainFrame
    const request = parseRuntimeOrpcConnectPortRequest(value)
    if (!window || !isMainFrame || !request || event.ports.length !== 1) {
      for (const port of event.ports) {
        port.close()
      }
      return
    }

    const [port] = event.ports
    const target = request.target ?? { kind: 'local' as const }
    if (target.kind === 'environment') {
      void connectRuntimeEnvironmentOrpcMessagePort({
        userDataPath: getRuntimeHostPathsProvider().userDataPath(),
        ownerId: String(event.sender.id),
        target,
        port
      })
      return
    }
    const connectionId = randomUUID()
    handler.upgrade(port, {
      context: createRuntimeOrpcContext(runtime, {
        authenticatedCallerFingerprint: authenticatedTokenFingerprint('desktop-ipc'),
        connectionId,
        // Why: lets forward handlers (e.g. notifications.report) reverse-call
        // back into this same shell via shell-services-reverse-link.ts.
        shellConnectionId: electronShellServicesConnectionId(event.sender.id),
        renderingWebContentsId: event.sender.id
      })
    })
    port.once('close', () => runtime.cleanupSubscriptionsForConnection(connectionId))
    port.start()
    // Why: Phase 5 S1 — local-only reverse contract, established right after
    // the forward port so main can call back into this same shell.
    connectShellServicesReverseLink(event.sender)
  })
}
