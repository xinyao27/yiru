import { describe, expect, it, vi } from 'vite-plus/test'
import type { TerminalLeafId } from '../../../../shared/stable-pane-id'
import { handleFocusTerminalPaneDetail } from './focus-terminal-pane-event'

const LEAF_ID = '11111111-1111-4111-8111-111111111111' as TerminalLeafId
const OTHER_LEAF_ID = '22222222-2222-4222-8222-222222222222' as TerminalLeafId

function createPaneElement(): HTMLElement {
  return { classList: { add: vi.fn(), remove: vi.fn() } } as unknown as HTMLElement
}

function createManager(args?: { numericPaneId?: number | null; leafId?: TerminalLeafId }) {
  const container = createPaneElement()
  const numericPaneId = args?.numericPaneId ?? 7
  const leafId = args?.leafId ?? LEAF_ID
  return {
    container,
    manager: {
      getNumericIdForLeaf: vi.fn(() => numericPaneId),
      getPanes: vi.fn(() => [
        {
          id: 7,
          leafId,
          container
        }
      ]),
      setActivePane: vi.fn()
    }
  }
}

describe('handleFocusTerminalPaneDetail', () => {
  it('focuses and acknowledges only after the target leaf resolves', () => {
    const { manager } = createManager()
    const acknowledgeAgents = vi.fn()
    const surfaceStaleAgentRow = vi.fn()

    handleFocusTerminalPaneDetail(
      {
        tabId: 'tab-1',
        leafId: LEAF_ID,
        ackPaneKeyOnSuccess: `tab-1:${LEAF_ID}`,
        flashFocusedPane: true
      },
      {
        tabId: 'tab-1',
        manager,
        acknowledgeAgents,
        surfaceStaleAgentRow
      }
    )

    expect(manager.setActivePane).toHaveBeenCalledWith(7, { focus: true })
    expect(acknowledgeAgents).toHaveBeenCalledWith([`tab-1:${LEAF_ID}`])
    expect(surfaceStaleAgentRow).not.toHaveBeenCalled()
  })

  it('requests follow-output scrolling after resolving the target leaf', () => {
    const { manager } = createManager()
    const scrollToBottomIfOutputSinceLastView = vi.fn()

    handleFocusTerminalPaneDetail(
      {
        tabId: 'tab-1',
        leafId: LEAF_ID,
        scrollToBottomIfOutputSinceLastView: true
      },
      {
        tabId: 'tab-1',
        manager,
        acknowledgeAgents: vi.fn(),
        surfaceStaleAgentRow: vi.fn(),
        scrollToBottomIfOutputSinceLastView
      }
    )

    expect(manager.setActivePane).toHaveBeenCalledWith(7, { focus: true })
    expect(scrollToBottomIfOutputSinceLastView).toHaveBeenCalledWith(7)
  })

  it('does not focus or acknowledge when the numeric pane no longer owns the leaf', () => {
    const { manager } = createManager({ leafId: OTHER_LEAF_ID })
    const acknowledgeAgents = vi.fn()
    const surfaceStaleAgentRow = vi.fn()

    handleFocusTerminalPaneDetail(
      {
        tabId: 'tab-1',
        leafId: LEAF_ID,
        ackPaneKeyOnSuccess: `tab-1:${LEAF_ID}`,
        flashFocusedPane: true
      },
      {
        tabId: 'tab-1',
        manager,
        acknowledgeAgents,
        surfaceStaleAgentRow
      }
    )

    expect(manager.setActivePane).not.toHaveBeenCalled()
    expect(acknowledgeAgents).not.toHaveBeenCalled()
    expect(surfaceStaleAgentRow).toHaveBeenCalledWith('tab-1', LEAF_ID)
  })
})
