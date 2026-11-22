// sRGB hex arithmetic for deriving accent tokens from the preset colours, all `#rrggbb`.

type Rgb = readonly [number, number, number]

const CHANNEL_MAX = 255
// WCAG 2.x relative luminance
const LINEAR_THRESHOLD = 0.04045
const LINEAR_DIVISOR = 12.92
const GAMMA_OFFSET = 0.055
const GAMMA_EXPONENT = 2.4
const LUMINANCE_WEIGHTS: Rgb = [0.2126, 0.7152, 0.0722]
const CONTRAST_OFFSET = 0.05

const rgbOf = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]

const hexOf = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

/** `amount` of `toward` mixed into `hex`, 0 keeps `hex`, 1 gives `toward`. */
export const mixHex = (hex: string, toward: string, amount: number): string => {
  const from = rgbOf(hex)
  const to = rgbOf(toward)
  const channel = (i: 0 | 1 | 2) => from[i] + (to[i] - from[i]) * amount
  return hexOf([channel(0), channel(1), channel(2)])
}

const luminanceOf = (hex: string): number =>
  rgbOf(hex)
    .map((channel) => channel / CHANNEL_MAX)
    .map((c) =>
      c <= LINEAR_THRESHOLD
        ? c / LINEAR_DIVISOR
        : ((c + GAMMA_OFFSET) / (1 + GAMMA_OFFSET)) ** GAMMA_EXPONENT
    )
    .reduce((sum, c, i) => sum + c * LUMINANCE_WEIGHTS[i], 0)

export const contrastOf = (a: string, b: string): number => {
  const [light, dark] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x)
  return (light + CONTRAST_OFFSET) / (dark + CONTRAST_OFFSET)
}

const STEP = 0.04
const MAX_STEPS = 25

/**
 * `hex` moved toward `toward` (black or white) in small steps until it reaches `ratio` against
 * `surface`. Stops at `toward` itself, which always passes for black or white on a mid surface.
 */
export const shiftUntilContrast = (
  hex: string,
  toward: string,
  surface: string,
  ratio: number
): string => {
  for (let step = 0; step <= MAX_STEPS; step++) {
    const candidate = mixHex(hex, toward, Math.min(1, step * STEP))
    if (contrastOf(candidate, surface) >= ratio) return candidate
  }
  return toward
}
