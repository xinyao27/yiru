import { Buffer } from 'node:buffer'

import type { WebSocket } from 'ws'

import { buildPrintToPdfOptions, CdpPdfStreamStore } from './cdp-print-to-pdf'
import type { CdpWsTransport } from './cdp-ws-transport'
import type { BrowserPageHandle } from './page/handle'

export class CdpPdfCommandHandler {
  private readonly page: BrowserPageHandle
  private readonly streams = new CdpPdfStreamStore()
  private readonly transport: CdpWsTransport

  constructor(page: BrowserPageHandle, transport: CdpWsTransport) {
    this.page = page
    this.transport = transport
  }

  clear(): void {
    this.streams.clear()
  }

  dispatch(
    client: WebSocket,
    clientId: number,
    method: string,
    params: Record<string, unknown>
  ): boolean {
    if (method === 'Page.printToPDF') {
      void this.print(client, clientId, params)
      return true
    }
    if (method === 'IO.read' && this.streams.ownsHandle(params)) {
      const chunk = this.streams.read(params)
      if (chunk) {
        this.transport.sendResult(client, clientId, {
          base64Encoded: true,
          data: chunk.data,
          eof: chunk.eof
        })
      } else {
        this.transport.sendError(client, clientId, 'Invalid stream handle')
      }
      return true
    }
    if (method === 'IO.close' && this.streams.ownsHandle(params)) {
      this.streams.close(params)
      this.transport.sendResult(client, clientId, {})
      return true
    }
    return false
  }

  private async print(
    client: WebSocket,
    clientId: number,
    params: Record<string, unknown>
  ): Promise<void> {
    if (this.page.isClosed()) {
      this.transport.sendError(client, clientId, 'Browser tab is no longer available')
      return
    }
    try {
      const pdf = await this.page.printToPdf(buildPrintToPdfOptions(params))
      // Why: do not retain a stream if the requesting client disappeared while
      // native printToPDF was resolving.
      if (!this.transport.isActiveClient(client)) {
        return
      }
      const buffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf)
      if (params.transferMode === 'ReturnAsStream') {
        const handle = this.streams.create(buffer)
        this.transport.sendResult(client, clientId, { data: '', stream: handle })
      } else {
        this.transport.sendResult(client, clientId, { data: buffer.toString('base64') })
      }
    } catch (error) {
      this.transport.sendError(
        client,
        clientId,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
