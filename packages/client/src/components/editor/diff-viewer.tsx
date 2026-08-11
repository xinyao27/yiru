import type { DiffViewerProps } from './diff-viewer-props'
import { PierreReadonlyDiffViewer } from './pierre-readonly-diff-viewer'

/**
 * Every diff in the app, editable or not.
 *
 * Why: this used to fork on `editable` because @pierre/diffs could only render.
 * Its edit mode covers the unstaged save workflow now, so both sides share one
 * renderer and one scroll model.
 */
export default function DiffViewer(props: DiffViewerProps): React.JSX.Element {
  return <PierreReadonlyDiffViewer {...props} />
}
