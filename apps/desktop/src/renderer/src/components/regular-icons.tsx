import {
  ArrowClockwise as PhosphorArrowClockwise,
  ArrowCounterClockwise as PhosphorArrowCounterClockwise,
  ArrowDown as PhosphorArrowDown,
  ArrowElbowDownLeft as PhosphorArrowElbowDownLeft,
  ArrowLeft as PhosphorArrowLeft,
  ArrowLineDown as PhosphorArrowLineDown,
  ArrowLineUp as PhosphorArrowLineUp,
  ArrowRight as PhosphorArrowRight,
  ArrowSquareOut as PhosphorArrowSquareOut,
  ArrowUp as PhosphorArrowUp,
  ArrowUpRight as PhosphorArrowUpRight,
  ArrowsClockwise as PhosphorArrowsClockwise,
  ArrowsDownUp as PhosphorArrowsDownUp,
  ArrowsIn as PhosphorArrowsIn,
  ArrowsLeftRight as PhosphorArrowsLeftRight,
  ArrowsOut as PhosphorArrowsOut,
  CaretDown as PhosphorCaretDown,
  CaretLeft as PhosphorCaretLeft,
  CaretRight as PhosphorCaretRight,
  CaretUp as PhosphorCaretUp,
  CaretUpDown as PhosphorCaretUpDown,
  ChatCentered as PhosphorChatCentered,
  CloudArrowUp as PhosphorCloudArrowUp,
  FileArrowUp as PhosphorFileArrowUp,
  FilePlus as PhosphorFilePlus,
  FlowArrow as PhosphorFlowArrow,
  FolderPlus as PhosphorFolderPlus,
  GitBranch as PhosphorGitBranch,
  MonitorArrowUp as PhosphorMonitorArrowUp,
  Plus as PhosphorPlus,
  type Icon,
  type IconProps
} from '@phosphor-icons/react'
import { forwardRef } from 'react'

function createRegularIcon(IconComponent: Icon, displayName: string): Icon {
  const RegularIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <IconComponent {...props} ref={ref} weight="regular" />
  ))
  RegularIcon.displayName = displayName
  return RegularIcon
}

// Why: duotone add and arrow affordances gain filled background shapes that
// make compact controls look selected; these icon roles intentionally stay plain.
export const ArrowClockwise = createRegularIcon(PhosphorArrowClockwise, 'ArrowClockwise')
export const ArrowCounterClockwise = createRegularIcon(
  PhosphorArrowCounterClockwise,
  'ArrowCounterClockwise'
)
export const ArrowDown = createRegularIcon(PhosphorArrowDown, 'ArrowDown')
export const ArrowElbowDownLeft = createRegularIcon(
  PhosphorArrowElbowDownLeft,
  'ArrowElbowDownLeft'
)
export const ArrowLeft = createRegularIcon(PhosphorArrowLeft, 'ArrowLeft')
export const ArrowLineDown = createRegularIcon(PhosphorArrowLineDown, 'ArrowLineDown')
export const ArrowLineUp = createRegularIcon(PhosphorArrowLineUp, 'ArrowLineUp')
export const ArrowRight = createRegularIcon(PhosphorArrowRight, 'ArrowRight')
export const ArrowSquareOut = createRegularIcon(PhosphorArrowSquareOut, 'ArrowSquareOut')
export const ArrowUp = createRegularIcon(PhosphorArrowUp, 'ArrowUp')
export const ArrowUpRight = createRegularIcon(PhosphorArrowUpRight, 'ArrowUpRight')
export const ArrowsClockwise = createRegularIcon(PhosphorArrowsClockwise, 'ArrowsClockwise')
export const ArrowsDownUp = createRegularIcon(PhosphorArrowsDownUp, 'ArrowsDownUp')
export const ArrowsIn = createRegularIcon(PhosphorArrowsIn, 'ArrowsIn')
export const ArrowsLeftRight = createRegularIcon(PhosphorArrowsLeftRight, 'ArrowsLeftRight')
export const ArrowsOut = createRegularIcon(PhosphorArrowsOut, 'ArrowsOut')
export const CaretDown = createRegularIcon(PhosphorCaretDown, 'CaretDown')
export const CaretLeft = createRegularIcon(PhosphorCaretLeft, 'CaretLeft')
export const CaretRight = createRegularIcon(PhosphorCaretRight, 'CaretRight')
export const CaretUp = createRegularIcon(PhosphorCaretUp, 'CaretUp')
export const CaretUpDown = createRegularIcon(PhosphorCaretUpDown, 'CaretUpDown')
export const ChatCentered = createRegularIcon(PhosphorChatCentered, 'ChatCentered')
export const CloudArrowUp = createRegularIcon(PhosphorCloudArrowUp, 'CloudArrowUp')
export const FileArrowUp = createRegularIcon(PhosphorFileArrowUp, 'FileArrowUp')
export const FilePlus = createRegularIcon(PhosphorFilePlus, 'FilePlus')
export const FlowArrow = createRegularIcon(PhosphorFlowArrow, 'FlowArrow')
export const FolderPlus = createRegularIcon(PhosphorFolderPlus, 'FolderPlus')
export const GitBranch = createRegularIcon(PhosphorGitBranch, 'GitBranch')
export const MonitorArrowUp = createRegularIcon(PhosphorMonitorArrowUp, 'MonitorArrowUp')
export const Plus = createRegularIcon(PhosphorPlus, 'Plus')
