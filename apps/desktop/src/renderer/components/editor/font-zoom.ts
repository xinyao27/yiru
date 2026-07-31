const EDITOR_FONT_ZOOM_MIN = -6
const EDITOR_FONT_ZOOM_MAX = 18
const EDITOR_FONT_ZOOM_STEP = 1

export type EditorZoomDirection = 'in' | 'out' | 'reset'

export function clampEditorFontZoomLevel(level: number): number {
  return Math.max(EDITOR_FONT_ZOOM_MIN, Math.min(EDITOR_FONT_ZOOM_MAX, level))
}

export function nextEditorFontZoomLevel(current: number, direction: EditorZoomDirection): number {
  if (direction === 'reset') {
    return 0
  }
  if (direction === 'in') {
    return clampEditorFontZoomLevel(current + EDITOR_FONT_ZOOM_STEP)
  }
  return clampEditorFontZoomLevel(current - EDITOR_FONT_ZOOM_STEP)
}

export function computeEditorFontSize(baseFontSize: number, zoomLevel: number): number {
  // Why: Monaco and markdown surfaces become unreadable or visually broken at
  // extreme values. Clamp after applying zoom so all editor-like surfaces stay
  // within the same safe range regardless of their own default base size.
  return Math.max(8, Math.min(32, baseFontSize + zoomLevel))
}

export function computeDiffEditorFontSize(baseFontSize: number, zoomLevel: number): number {
  // Why: the code font size is one shared baseline for editors and diffs, so
  // moving between source and review views must not change the text scale.
  return computeEditorFontSize(baseFontSize, zoomLevel)
}
