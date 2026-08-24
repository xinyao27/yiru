export const BROWSER_STORYBOARD_PROMPT = 'Make Starter card stand out'

export type BrowserStoryboardPhase =
  | 'idle'
  | 'newtab-approach'
  | 'newtab-click'
  | 'newtab-row-approach'
  | 'newtab-row-click'
  | 'tab-revealed'
  | 'approach-card'
  | 'inspect'
  | 'annotate'
  | 'send-approach'
  | 'send-click'
  | 'handoff'
  | 'working'
  | 'updated'
  | 'verify-intent'
  | 'click-approach'
  | 'click-press'
  | 'navigated'
  | 'screenshot-line'
  | 'screenshot-flash'
  | 'verified'

export const BROWSER_STORYBOARD_MS = {
  preIntro: 600,
  newtabApproach: 700,
  newtabClick: 180,
  newtabDwell: 700,
  newtabRowHover: 1050,
  newtabRowClick: 220,
  tabReveal: 500,
  approachCard: 900,
  inspect: 700,
  annotateOpen: 360,
  annotateTypeInterval: 58,
  annotateHold: 900,
  sendApproach: 500,
  sendClick: 250,
  handoff: 200,
  workingLineStagger: 260,
  workingHold: 1400,
  updatedHold: 900,
  verifyIntent: 1100,
  clickApproach: 620,
  clickPress: 280,
  navigatedHold: 700,
  screenshotLineHold: 420,
  screenshotFlashHold: 700,
  verifiedHold: 2400,
  resetHold: 300,
  clickRing: 460
} as const

const PHASE_ORDER: readonly BrowserStoryboardPhase[] = [
  'idle',
  'newtab-approach',
  'newtab-click',
  'newtab-row-approach',
  'newtab-row-click',
  'tab-revealed',
  'approach-card',
  'inspect',
  'annotate',
  'send-approach',
  'send-click',
  'handoff',
  'working',
  'updated',
  'verify-intent',
  'click-approach',
  'click-press',
  'navigated',
  'screenshot-line',
  'screenshot-flash',
  'verified'
]

const SPLIT_PHASES: readonly BrowserStoryboardPhase[] = [
  'working',
  'updated',
  'verify-intent',
  'click-approach',
  'click-press',
  'navigated',
  'screenshot-line',
  'screenshot-flash',
  'verified'
]

export function browserPhaseAtLeast(
  current: BrowserStoryboardPhase,
  target: BrowserStoryboardPhase
): boolean {
  return PHASE_ORDER.indexOf(current) >= PHASE_ORDER.indexOf(target)
}

export function isBrowserSplitPhase(phase: BrowserStoryboardPhase): boolean {
  return SPLIT_PHASES.includes(phase)
}
