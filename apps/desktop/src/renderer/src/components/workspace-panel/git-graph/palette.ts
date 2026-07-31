// Why: colour belongs to a lane, not a branch name or our theme — this is the
// upstream 12-hex default (byte-identical in package.json and config.ts),
// theme-independent by design upstream too. Our token budget only has 8 graph
// colours, so this stays plain data here instead of growing that budget.
export const GIT_GRAPH_COLORS: readonly string[] = [
  '#0085d9',
  '#d9008f',
  '#00d90a',
  '#d98500',
  '#a300d9',
  '#ff0000',
  '#00d9cc',
  '#e138e8',
  '#85d900',
  '#dc5b23',
  '#6f24d6',
  '#ffcc00'
]

// Why: the upstream 12 hexes are tuned for vscode-git-graph's dark webview.
// `#ffcc00` and `#00d90a` in particular are near-invisible 1px strokes on a
// light surface, so this app (which themes both ways) needs a darkened,
// still-recognisable variant per lane colour for light mode.
export const GIT_GRAPH_COLORS_LIGHT: readonly string[] = [
  '#0074c2',
  '#c2007f',
  '#0a9e12',
  '#b87200',
  '#8f00c2',
  '#d61a1a',
  '#00968a',
  '#c221c9',
  '#5c9e00',
  '#b84a1a',
  '#5c1ec2',
  '#a37a00'
]

export function gitGraphPalette(isDark: boolean): readonly string[] {
  return isDark ? GIT_GRAPH_COLORS : GIT_GRAPH_COLORS_LIGHT
}
