export type DitherSeed = {
  fill: readonly [number, number, number]
}

export const MONOCHROME_DITHER_SEED: DitherSeed = {
  fill: [105, 105, 116]
}

export function ditherColor([red, green, blue]: DitherSeed['fill'], alpha = 1): string {
  return `rgba(${red},${green},${blue},${alpha})`
}
