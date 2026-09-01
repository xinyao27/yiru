import './xterm-environment'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { Terminal } from '@xterm/headless'

const DEFAULT_SCROLLBACK_ROWS = 5_000

type SynchronousTerminal = Terminal & {
  _core?: { writeSync?: (data: string) => void }
}

export type BunTerminalBufferSnapshot = {
  alternateScreen: boolean
  cols: number
  data: string
  rows: number
  seq: number
  source: 'headless'
}

export class BunTerminalBuffer {
  private readonly serializer = new SerializeAddon()
  private readonly terminal: Terminal
  private sequence = 0
  private writeChain = Promise.resolve()

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols,
      logLevel: 'off',
      rows,
      scrollback: DEFAULT_SCROLLBACK_ROWS
    })
    this.terminal.loadAddon(this.serializer)
    this.terminal.loadAddon(new Unicode11Addon())
    this.terminal.unicode.activeVersion = '11'
  }

  write(data: string): void {
    if (!data) {
      return
    }
    this.sequence += data.length
    const writeSync = (this.terminal as SynchronousTerminal)._core?.writeSync
    if (typeof writeSync === 'function') {
      writeSync.call((this.terminal as SynchronousTerminal)._core, data)
      return
    }
    this.writeChain = this.writeChain.then(
      () =>
        new Promise<void>((resolve) => {
          this.terminal.write(data, resolve)
        })
    )
  }

  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows)
  }

  async clear(): Promise<void> {
    await this.writeChain
    this.terminal.clear()
  }

  async snapshot(scrollbackRows?: number): Promise<BunTerminalBufferSnapshot> {
    await this.writeChain
    return {
      alternateScreen: this.terminal.buffer.active.type === 'alternate',
      cols: this.terminal.cols,
      data: this.serializer.serialize({ scrollback: scrollbackRows }),
      rows: this.terminal.rows,
      seq: this.sequence,
      source: 'headless'
    }
  }

  async dispose(): Promise<void> {
    await this.writeChain
    this.terminal.dispose()
  }
}
