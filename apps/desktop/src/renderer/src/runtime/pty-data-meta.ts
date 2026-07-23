export type PtyDataMeta = {
  seq?: number
  rawLength?: number
  background?: boolean
  /** Main dropped this PTY's buffered output at the pending cap; the pane
   * must repaint from the main-owned snapshot instead of the live stream. */
  droppedOutput?: boolean
}
