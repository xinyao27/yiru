import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import { bubblePathBetweenRows } from './orchestration-bubble-path'
import {
  OrchestrationStage,
  useOrchestrationStageRefs,
  type OrchestrationBubble,
  type OrchestrationStageRefs
} from './orchestration-stage'
import {
  BUBBLE_FLIGHT_MS,
  BUBBLE_GAP_MS,
  BUBBLE_LAND_MS,
  INITIAL_ROW_MESSAGES,
  INITIAL_ROW_STATE,
  ORCHESTRATION_CLI_COMMAND_TIMINGS_MS,
  PHASE1_BEATS,
  type Beat,
  type RowFlash,
  type RowMessages,
  type RowPending,
  type RowState
} from './orchestration-types'

import './orchestration.css'

const INITIAL_CHILD_PENDING: RowPending = {
  'child-codex': true,
  'child-claude': true
}

const CHILD_ONE_CREATE_MS = ORCHESTRATION_CLI_COMMAND_TIMINGS_MS[0]
const CHILD_TWO_CREATE_MS = ORCHESTRATION_CLI_COMMAND_TIMINGS_MS[1]
const FIRST_DISPATCH_MS = ORCHESTRATION_CLI_COMMAND_TIMINGS_MS[2]

type AnimatedOrchestrationProps = {
  controlledCreatedChildCount?: number
  loopMs?: number
  onCycleComplete?: () => void
  showResponseBeats: boolean
}

function resolveBubbleTarget(
  stageRefs: OrchestrationStageRefs,
  beat: Beat,
  wasPending: boolean
): { from: HTMLDivElement; stage: HTMLDivElement; to: HTMLElement } | undefined {
  const from = stageRefs.rows.current[beat.from]
  const recipient = stageRefs.rows.current[beat.to]
  const stage = stageRefs.stage.current
  if (!from || !recipient || !stage) {
    return undefined
  }
  const recipientCard = recipient.closest<HTMLElement>('[data-feature-wall-card]')
  return { from, stage, to: wasPending ? (recipientCard ?? recipient) : recipient }
}

function AnimatedOrchestration(props: AnimatedOrchestrationProps): JSX.Element {
  const { controlledCreatedChildCount, loopMs, onCycleComplete, showResponseBeats } = props
  const stageRefs = useOrchestrationStageRefs()
  const pendingMirror = useRef<RowPending>({ ...INITIAL_CHILD_PENDING })
  const bubbleId = useRef(0)
  const [rowState, setRowState] = useState<RowState>(INITIAL_ROW_STATE)
  const [rowMessages, setRowMessages] = useState<RowMessages>(INITIAL_ROW_MESSAGES)
  const [rowFlash, setRowFlash] = useState<RowFlash>({})
  const [rowPending, setRowPending] = useState<RowPending>(INITIAL_CHILD_PENDING)
  const [createdChildCount, setCreatedChildCount] = useState(0)
  const [bubble, setBubble] = useState<OrchestrationBubble>()
  const displayedChildCount = controlledCreatedChildCount ?? createdChildCount

  useEffect(() => {
    let cancelled = false
    const timers = new Set<number>()
    const frames = new Set<number>()
    const later = (action: () => void, durationMs: number): void => {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        if (!cancelled) {
          action()
        }
      }, durationMs)
      timers.add(timer)
    }
    const nextFrame = (action: () => void): void => {
      const frame = requestAnimationFrame(() => {
        frames.delete(frame)
        if (!cancelled) {
          action()
        }
      })
      frames.add(frame)
    }

    const fireBubble = (beat: Beat): void => {
      const wasPending = pendingMirror.current[beat.to] === true
      const target = resolveBubbleTarget(stageRefs, beat, wasPending)
      if (!target) {
        return
      }
      if (beat.senderFinishes) {
        setRowState((state) => ({ ...state, [beat.from]: 'done' }))
      }

      const id = bubbleId.current + 1
      bubbleId.current = id
      const path = bubblePathBetweenRows(target.stage, target.from, target.to)
      setBubble({ id, path, phase: 'ready' })
      nextFrame(() => {
        setBubble((current) => (current?.id === id ? { ...current, phase: 'in-flight' } : current))
      })

      later(() => {
        if (wasPending) {
          pendingMirror.current = { ...pendingMirror.current, [beat.to]: false }
          setRowPending((pending) => ({ ...pending, [beat.to]: false }))
        }
        const replacement =
          beat.to === 'coord-claude' && beat.coordMsg ? beat.coordMsg : beat.recipientMsg
        if (replacement) {
          setRowMessages((messages) => ({ ...messages, [beat.to]: replacement }))
          setRowFlash((flash) => ({ ...flash, [beat.to]: (flash[beat.to] ?? 0) + 1 }))
        }
        setBubble((current) => (current?.id === id ? { ...current, phase: 'landed' } : current))
      }, BUBBLE_FLIGHT_MS)

      later(() => {
        setBubble((current) => (current?.id === id ? undefined : current))
      }, BUBBLE_LAND_MS)
    }

    const startCycle = (isReplay: boolean): void => {
      if (isReplay) {
        setRowState(INITIAL_ROW_STATE)
        setRowMessages(INITIAL_ROW_MESSAGES)
        setRowFlash({})
        setRowPending(INITIAL_CHILD_PENDING)
        setBubble(undefined)
        pendingMirror.current = { ...INITIAL_CHILD_PENDING }
        if (controlledCreatedChildCount === undefined) {
          setCreatedChildCount(0)
        }
      }
      if (controlledCreatedChildCount === undefined) {
        later(() => setCreatedChildCount(1), CHILD_ONE_CREATE_MS)
        later(() => setCreatedChildCount(2), CHILD_TWO_CREATE_MS)
      }

      const beats = showResponseBeats ? PHASE1_BEATS : PHASE1_BEATS.slice(0, 2)
      let beatIndex = 0
      const dispatchNext = (): void => {
        const beat = beats[beatIndex]
        if (!beat) {
          later(() => {
            onCycleComplete?.()
            const elapsedMs = FIRST_DISPATCH_MS + beats.length * BUBBLE_GAP_MS + 800
            later(() => startCycle(true), loopMs ? Math.max(0, loopMs - elapsedMs) : 1400)
          }, 800)
          return
        }
        fireBubble(beat)
        beatIndex += 1
        later(dispatchNext, BUBBLE_GAP_MS)
      }
      later(dispatchNext, FIRST_DISPATCH_MS)
    }

    startCycle(false)
    return () => {
      cancelled = true
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
      for (const frame of frames) {
        cancelAnimationFrame(frame)
      }
    }
  }, [controlledCreatedChildCount, loopMs, onCycleComplete, showResponseBeats, stageRefs])

  return (
    <OrchestrationStage
      bubble={bubble}
      childCount={displayedChildCount}
      rowFlash={rowFlash}
      rowMessages={rowMessages}
      rowPending={rowPending}
      rowState={rowState}
      stageRefs={stageRefs}
    />
  )
}

function StaticOrchestration(props: { childCount: number; pending: RowPending }): JSX.Element {
  const stageRefs = useOrchestrationStageRefs()
  return (
    <OrchestrationStage
      childCount={props.childCount}
      rowFlash={{}}
      rowMessages={INITIAL_ROW_MESSAGES}
      rowPending={props.pending}
      rowState={INITIAL_ROW_STATE}
      stageRefs={stageRefs}
    />
  )
}

export function OrchestrationPage(props: {
  active: boolean
  reducedMotion: boolean
  onCycleComplete?: () => void
  controlledCreatedChildCount?: number
  loopMs?: number
  showResponseBeats?: boolean
}): JSX.Element {
  const controlledCount = props.controlledCreatedChildCount
  if (!props.active) {
    return <StaticOrchestration childCount={controlledCount ?? 0} pending={INITIAL_CHILD_PENDING} />
  }
  if (props.reducedMotion) {
    return <StaticOrchestration childCount={controlledCount ?? 2} pending={{}} />
  }
  const animationKey = `${controlledCount ?? 'internal'}:${props.loopMs ?? 'default'}:${
    props.showResponseBeats ?? true
  }`
  return (
    <AnimatedOrchestration
      key={animationKey}
      controlledCreatedChildCount={controlledCount}
      loopMs={props.loopMs}
      onCycleComplete={props.onCycleComplete}
      showResponseBeats={props.showResponseBeats ?? true}
    />
  )
}
